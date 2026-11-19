from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import Optional, List

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.services.invite_service import InviteService
from app.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/invites", tags=["invites"])


class InviteCreate(BaseModel):
    email: Optional[EmailStr] = None
    role: str = "member"
    expires_in_days: int = 7


class InviteResponse(BaseModel):
    id: str
    workspace_id: str
    email: Optional[str]
    role: str
    token: str
    invite_url: str
    expires_at: str
    used_at: Optional[str]
    created_at: str


class InviteValidation(BaseModel):
    token: str
    email: Optional[EmailStr] = None


class InviteValidationResponse(BaseModel):
    valid: bool
    workspace_name: Optional[str] = None
    workspace_slug: Optional[str] = None
    role: Optional[str] = None
    error: Optional[str] = None


@router.post("/", response_model=InviteResponse)
async def create_invite(
    invite: InviteCreate,
    current_user: dict = Depends(require_admin),
    db=Depends(get_db)
):
    """Create a new invite (admin only)"""
    if invite.role not in ["admin", "member"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role. Must be 'admin' or 'member'"
        )

    workspace_service = WorkspaceService(db)
    workspace = await workspace_service.get_by_id(current_user["workspace_id"])

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found"
        )

    invite_service = InviteService(db)
    new_invite = await invite_service.create(
        workspace_id=current_user["workspace_id"],
        workspace_slug=workspace["slug"],
        email=invite.email,
        role=invite.role,
        expires_in_days=invite.expires_in_days
    )

    if not new_invite:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create invite"
        )

    return new_invite


@router.get("/", response_model=List[InviteResponse])
async def list_invites(
    current_user: dict = Depends(require_admin),
    db=Depends(get_db)
):
    """List all invites for workspace (admin only)"""
    invite_service = InviteService(db)
    invites = await invite_service.get_by_workspace(current_user["workspace_id"])
    return invites


@router.get("/pending", response_model=List[InviteResponse])
async def list_pending_invites(
    current_user: dict = Depends(require_admin),
    db=Depends(get_db)
):
    """List pending (unused, not expired) invites"""
    invite_service = InviteService(db)
    invites = await invite_service.get_pending_invites(current_user["workspace_id"])
    return invites


@router.post("/validate", response_model=InviteValidationResponse)
async def validate_invite(
    validation: InviteValidation,
    db=Depends(get_db)
):
    """Validate an invite token (public endpoint)"""
    invite_service = InviteService(db)
    result = await invite_service.validate_token(validation.token, validation.email)

    if not result["valid"]:
        return InviteValidationResponse(
            valid=False,
            error=result["error"]
        )

    invite = result["invite"]
    workspace = invite.get("workspace", {})

    return InviteValidationResponse(
        valid=True,
        workspace_name=workspace.get("name"),
        workspace_slug=workspace.get("slug"),
        role=invite["role"]
    )


@router.delete("/{invite_id}")
async def delete_invite(
    invite_id: str,
    current_user: dict = Depends(require_admin),
    db=Depends(get_db)
):
    """Delete an invite (admin only)"""
    invite_service = InviteService(db)
    await invite_service.delete(invite_id)
    return {"success": True}


@router.delete("/expired/cleanup")
async def cleanup_expired_invites(
    current_user: dict = Depends(require_admin),
    db=Depends(get_db)
):
    """Delete all expired invites (admin only)"""
    invite_service = InviteService(db)
    count = await invite_service.delete_expired(current_user["workspace_id"])
    return {"success": True, "deleted_count": count}
