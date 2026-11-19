from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models import Team, TeamMember, User


class TeamService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        workspace_id: str,
        name: str,
        description: Optional[str] = None,
        color: str = "#F97316"
    ) -> Team:
        team = Team(
            workspace_id=workspace_id,
            name=name,
            description=description,
            color=color
        )
        self.db.add(team)
        await self.db.commit()
        await self.db.refresh(team)
        return team

    async def get_by_id(self, team_id: str) -> Optional[Team]:
        result = await self.db.execute(select(Team).where(Team.id == team_id))
        return result.scalar_one_or_none()

    async def get_by_workspace(self, workspace_id: str) -> List[Team]:
        result = await self.db.execute(
            select(Team).where(Team.workspace_id == workspace_id).order_by(Team.name)
        )
        return list(result.scalars().all())

    async def get_with_members(self, team_id: str) -> Optional[dict]:
        result = await self.db.execute(
            select(Team).options(selectinload(Team.members).selectinload(TeamMember.user))
            .where(Team.id == team_id)
        )
        team = result.scalar_one_or_none()
        if not team:
            return None

        members = [m.user for m in team.members]
        return {
            **{k: v for k, v in team.__dict__.items() if not k.startswith('_')},
            "members": members,
            "member_count": len(members)
        }

    async def get_teams_with_member_counts(self, workspace_id: str) -> List[dict]:
        teams = await self.get_by_workspace(workspace_id)
        result = []
        for team in teams:
            count = await self.db.execute(
                select(func.count(TeamMember.id)).where(TeamMember.team_id == team.id)
            )
            result.append({
                **{k: v for k, v in team.__dict__.items() if not k.startswith('_')},
                "member_count": count.scalar() or 0
            })
        return result

    async def update(
        self,
        team_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        color: Optional[str] = None
    ) -> Optional[Team]:
        team = await self.get_by_id(team_id)
        if not team:
            return None

        if name is not None:
            team.name = name
        if description is not None:
            team.description = description
        if color is not None:
            team.color = color

        await self.db.commit()
        await self.db.refresh(team)
        return team

    async def delete(self, team_id: str) -> bool:
        team = await self.get_by_id(team_id)
        if team:
            await self.db.delete(team)
            await self.db.commit()
            return True
        return False

    async def add_member(self, team_id: str, user_id: str) -> Optional[TeamMember]:
        member = TeamMember(team_id=team_id, user_id=user_id)
        self.db.add(member)
        await self.db.commit()
        await self.db.refresh(member)
        return member

    async def remove_member(self, team_id: str, user_id: str) -> bool:
        result = await self.db.execute(
            select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
        )
        member = result.scalar_one_or_none()
        if member:
            await self.db.delete(member)
            await self.db.commit()
            return True
        return False

    async def get_user_teams(self, user_id: str) -> List[Team]:
        result = await self.db.execute(
            select(Team).join(TeamMember).where(TeamMember.user_id == user_id)
        )
        return list(result.scalars().all())

    async def is_member(self, team_id: str, user_id: str) -> bool:
        result = await self.db.execute(
            select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
        )
        return result.scalar_one_or_none() is not None
