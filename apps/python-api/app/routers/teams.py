from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.services.team_service import TeamService

router = APIRouter(prefix="/teams", tags=["teams"])


class TeamCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#6366f1"


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class TeamMemberAdd(BaseModel):
    user_id: str


class TeamResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    description: Optional[str]
    color: str
    created_at: str


class TeamWithMembersResponse(TeamResponse):
    members: List[dict]


@router.post("/", response_model=TeamResponse)
async def create_team(
    team: TeamCreate,
    current_user: dict = Depends(require_admin),
    db=Depends(get_db)
):
    """Create a new team (admin only)"""
    team_service = TeamService(db)
    new_team = await team_service.create(
        workspace_id=current_user["workspace_id"],
        name=team.name,
        description=team.description,
        color=team.color
    )

    if not new_team:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create team"
        )

    return new_team


@router.get("/", response_model=List[TeamResponse])
async def list_teams(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """List all teams in workspace"""
    team_service = TeamService(db)
    teams = await team_service.get_by_workspace(current_user["workspace_id"])
    return teams


@router.get("/{team_id}", response_model=TeamWithMembersResponse)
async def get_team(
    team_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get team with members"""
    team_service = TeamService(db)
    team = await team_service.get_with_members(team_id)

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found"
        )

    if team["workspace_id"] != current_user["workspace_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Team is not in your workspace"
        )

    return team


@router.put("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: str,
    update: TeamUpdate,
    current_user: dict = Depends(require_admin),
    db=Depends(get_db)
):
    """Update team (admin only)"""
    team_service = TeamService(db)

    team = await team_service.get_by_id(team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found"
        )

    if team["workspace_id"] != current_user["workspace_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Team is not in your workspace"
        )

    updated = await team_service.update(
        team_id=team_id,
        name=update.name,
        description=update.description,
        color=update.color
    )

    return updated


@router.delete("/{team_id}")
async def delete_team(
    team_id: str,
    current_user: dict = Depends(require_admin),
    db=Depends(get_db)
):
    """Delete team (admin only)"""
    team_service = TeamService(db)

    team = await team_service.get_by_id(team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found"
        )

    if team["workspace_id"] != current_user["workspace_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Team is not in your workspace"
        )

    await team_service.delete(team_id)
    return {"success": True}


@router.post("/{team_id}/members")
async def add_team_member(
    team_id: str,
    member: TeamMemberAdd,
    current_user: dict = Depends(require_admin),
    db=Depends(get_db)
):
    """Add member to team (admin only)"""
    team_service = TeamService(db)

    team = await team_service.get_by_id(team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found"
        )

    if team["workspace_id"] != current_user["workspace_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Team is not in your workspace"
        )

    result = await team_service.add_member(team_id, member.user_id)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to add member"
        )

    return {"success": True}


@router.delete("/{team_id}/members/{user_id}")
async def remove_team_member(
    team_id: str,
    user_id: str,
    current_user: dict = Depends(require_admin),
    db=Depends(get_db)
):
    """Remove member from team (admin only)"""
    team_service = TeamService(db)

    team = await team_service.get_by_id(team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found"
        )

    if team["workspace_id"] != current_user["workspace_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Team is not in your workspace"
        )

    await team_service.remove_member(team_id, user_id)
    return {"success": True}


@router.get("/my-teams", response_model=List[TeamResponse])
async def get_my_teams(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get teams the current user belongs to"""
    team_service = TeamService(db)
    teams = await team_service.get_user_teams(current_user["sub"])
    return teams
