from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


class WorkspaceCreate(BaseModel):
    name: str


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None
    settings: Optional[dict] = None


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    slug: str
    logo_url: Optional[str]
    settings: Optional[dict]
    created_at: str


class MemberResponse(BaseModel):
    id: str
    email: str
    name: str
    avatar_url: Optional[str]
    role: str


@router.get("/current", response_model=WorkspaceResponse)
async def get_current_workspace(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get the current user's workspace"""
    workspace_service = WorkspaceService(db)
    workspace = await workspace_service.get_by_id(current_user["workspace_id"])

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found"
        )

    return workspace


@router.put("/current", response_model=WorkspaceResponse)
async def update_current_workspace(
    update: WorkspaceUpdate,
    current_user: dict = Depends(require_admin),
    db=Depends(get_db)
):
    """Update the current workspace (admin only)"""
    workspace_service = WorkspaceService(db)
    workspace = await workspace_service.update(
        workspace_id=current_user["workspace_id"],
        name=update.name,
        logo_url=update.logo_url,
        settings=update.settings
    )

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found"
        )

    return workspace


@router.get("/current/members", response_model=List[MemberResponse])
async def get_workspace_members(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get all members in the current workspace"""
    workspace_service = WorkspaceService(db)
    members = await workspace_service.get_members(current_user["workspace_id"])
    return members


@router.delete("/current/members/{user_id}")
async def remove_member(
    user_id: str,
    current_user: dict = Depends(require_admin),
    db=Depends(get_db)
):
    """Remove a member from the workspace (admin only)"""
    if user_id == current_user["sub"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove yourself"
        )

    workspace_service = WorkspaceService(db)
    success = await workspace_service.remove_member(
        current_user["workspace_id"],
        user_id
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found"
        )

    return {"success": True}


@router.put("/current/members/{user_id}/role")
async def update_member_role(
    user_id: str,
    role: str,
    current_user: dict = Depends(require_admin),
    db=Depends(get_db)
):
    """Update a member's role (admin only)"""
    if role not in ["admin", "member"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role. Must be 'admin' or 'member'"
        )

    if user_id == current_user["sub"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role"
        )

    workspace_service = WorkspaceService(db)
    user = await workspace_service.update_member_role(
        current_user["workspace_id"],
        user_id,
        role
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found"
        )

    return {"success": True, "role": role}
