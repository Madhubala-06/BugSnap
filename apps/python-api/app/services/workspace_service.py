import re
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models import Workspace, User, BugReport


class WorkspaceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _generate_slug(self, name: str) -> str:
        slug = name.lower()
        slug = re.sub(r'[^a-z0-9\s-]', '', slug)
        slug = re.sub(r'[\s_]+', '-', slug)
        slug = re.sub(r'-+', '-', slug)
        slug = slug.strip('-')
        return slug

    async def create(self, name: str) -> Workspace:
        base_slug = self._generate_slug(name)
        slug = base_slug

        counter = 1
        while True:
            result = await self.db.execute(select(Workspace).where(Workspace.slug == slug))
            if not result.scalar_one_or_none():
                break
            slug = f"{base_slug}-{counter}"
            counter += 1

        workspace = Workspace(name=name, slug=slug)
        self.db.add(workspace)
        await self.db.commit()
        await self.db.refresh(workspace)
        return workspace

    async def get_by_id(self, workspace_id: str) -> Optional[Workspace]:
        result = await self.db.execute(select(Workspace).where(Workspace.id == workspace_id))
        return result.scalar_one_or_none()

    async def get_by_slug(self, slug: str) -> Optional[Workspace]:
        result = await self.db.execute(select(Workspace).where(Workspace.slug == slug))
        return result.scalar_one_or_none()

    async def get_with_stats(self, workspace_id: str) -> Optional[dict]:
        workspace = await self.get_by_id(workspace_id)
        if not workspace:
            return None

        user_count = await self.db.execute(
            select(func.count(User.id)).where(User.workspace_id == workspace_id)
        )
        bug_count = await self.db.execute(
            select(func.count(BugReport.id)).where(BugReport.workspace_id == workspace_id)
        )

        return {
            **workspace.__dict__,
            "user_count": user_count.scalar() or 0,
            "bug_report_count": bug_count.scalar() or 0
        }

    async def update(
        self,
        workspace_id: str,
        name: Optional[str] = None,
        logo_url: Optional[str] = None,
        settings: Optional[dict] = None
    ) -> Optional[Workspace]:
        workspace = await self.get_by_id(workspace_id)
        if not workspace:
            return None

        if name is not None:
            workspace.name = name
        if logo_url is not None:
            workspace.logo_url = logo_url
        if settings is not None:
            workspace.settings = settings

        await self.db.commit()
        await self.db.refresh(workspace)
        return workspace

    async def get_members(self, workspace_id: str) -> List[User]:
        result = await self.db.execute(
            select(User).where(User.workspace_id == workspace_id).order_by(User.name)
        )
        return list(result.scalars().all())

    async def remove_member(self, workspace_id: str, user_id: str) -> bool:
        result = await self.db.execute(
            select(User).where(User.workspace_id == workspace_id, User.id == user_id)
        )
        user = result.scalar_one_or_none()
        if user:
            await self.db.delete(user)
            await self.db.commit()
            return True
        return False

    async def update_member_role(self, workspace_id: str, user_id: str, role: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).where(User.workspace_id == workspace_id, User.id == user_id)
        )
        user = result.scalar_one_or_none()
        if user:
            user.role = role
            await self.db.commit()
            await self.db.refresh(user)
            return user
        return None

    async def delete(self, workspace_id: str) -> bool:
        workspace = await self.get_by_id(workspace_id)
        if workspace:
            await self.db.delete(workspace)
            await self.db.commit()
            return True
        return False
