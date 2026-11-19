from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import User, Workspace
from app.core.security import get_password_hash, verify_password


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        email: str,
        name: str,
        workspace_id: str,
        role: str = "member",
        password: Optional[str] = None,
        avatar_url: Optional[str] = None
    ) -> User:
        user = User(
            email=email.lower(),
            name=name,
            workspace_id=workspace_id,
            role=role,
            avatar_url=avatar_url,
            password_hash=get_password_hash(password) if password else None
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def get_by_id(self, user_id: str) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.email == email.lower()))
        return result.scalar_one_or_none()

    async def get_by_workspace(self, workspace_id: str) -> List[User]:
        result = await self.db.execute(
            select(User).where(User.workspace_id == workspace_id).order_by(User.name)
        )
        return list(result.scalars().all())

    async def get_with_workspace(self, user_id: str) -> Optional[User]:
        result = await self.db.execute(
            select(User).options(selectinload(User.workspace)).where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def update(
        self,
        user_id: str,
        name: Optional[str] = None,
        avatar_url: Optional[str] = None,
        role: Optional[str] = None
    ) -> Optional[User]:
        user = await self.get_by_id(user_id)
        if not user:
            return None

        if name is not None:
            user.name = name
        if avatar_url is not None:
            user.avatar_url = avatar_url
        if role is not None:
            user.role = role

        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def verify_credentials(self, email: str, password: str) -> Optional[User]:
        user = await self.get_by_email(email)
        if not user or not user.password_hash:
            return None

        if not verify_password(password, user.password_hash):
            return None

        return user

    async def delete(self, user_id: str) -> bool:
        user = await self.get_by_id(user_id)
        if user:
            await self.db.delete(user)
            await self.db.commit()
            return True
        return False

    async def update_password(self, user_id: str, new_password: str) -> bool:
        user = await self.get_by_id(user_id)
        if user:
            user.password_hash = get_password_hash(new_password)
            await self.db.commit()
            return True
        return False
