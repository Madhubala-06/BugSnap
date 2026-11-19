import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import WorkspaceInvite, Workspace
from app.core.config import get_settings

settings = get_settings()


class InviteService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _generate_token(self) -> str:
        return secrets.token_urlsafe(32)

    def _get_invite_url(self, workspace_slug: str, token: str) -> str:
        return f"{settings.app_url}/join/{workspace_slug}?token={token}"

    async def create(
        self,
        workspace_id: str,
        workspace_slug: str,
        email: Optional[str] = None,
        role: str = "member",
        expires_in_days: int = 7
    ) -> dict:
        token = self._generate_token()
        expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)

        invite = WorkspaceInvite(
            workspace_id=workspace_id,
            email=email.lower() if email else None,
            token=token,
            role=role,
            expires_at=expires_at
        )
        self.db.add(invite)
        await self.db.commit()
        await self.db.refresh(invite)

        return {
            **{k: v for k, v in invite.__dict__.items() if not k.startswith('_')},
            "invite_url": self._get_invite_url(workspace_slug, token)
        }

    async def get_by_token(self, token: str) -> Optional[dict]:
        result = await self.db.execute(
            select(WorkspaceInvite)
            .options(selectinload(WorkspaceInvite.workspace))
            .where(WorkspaceInvite.token == token)
        )
        invite = result.scalar_one_or_none()
        if not invite:
            return None

        return {
            **{k: v for k, v in invite.__dict__.items() if not k.startswith('_')},
            "workspace": invite.workspace
        }

    async def validate_token(self, token: str, email: Optional[str] = None) -> dict:
        invite_data = await self.get_by_token(token)

        if not invite_data:
            return {"valid": False, "invite": None, "error": "Invalid invite token"}

        if invite_data.get("used_at"):
            return {"valid": False, "invite": invite_data, "error": "Invite has already been used"}

        if invite_data["expires_at"] < datetime.now(timezone.utc):
            return {"valid": False, "invite": invite_data, "error": "Invite has expired"}

        if invite_data.get("email") and email:
            if invite_data["email"].lower() != email.lower():
                return {"valid": False, "invite": invite_data, "error": "This invite is for a different email address"}

        return {"valid": True, "invite": invite_data, "error": None}

    async def mark_as_used(self, invite_id: str) -> bool:
        result = await self.db.execute(
            select(WorkspaceInvite).where(WorkspaceInvite.id == invite_id)
        )
        invite = result.scalar_one_or_none()
        if invite:
            invite.used_at = datetime.now(timezone.utc)
            await self.db.commit()
            return True
        return False

    async def get_by_workspace(self, workspace_id: str) -> List[WorkspaceInvite]:
        result = await self.db.execute(
            select(WorkspaceInvite)
            .where(WorkspaceInvite.workspace_id == workspace_id)
            .order_by(WorkspaceInvite.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_pending_invites(self, workspace_id: str) -> List[WorkspaceInvite]:
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(WorkspaceInvite)
            .where(
                WorkspaceInvite.workspace_id == workspace_id,
                WorkspaceInvite.used_at.is_(None),
                WorkspaceInvite.expires_at >= now
            )
            .order_by(WorkspaceInvite.created_at.desc())
        )
        return list(result.scalars().all())

    async def delete(self, invite_id: str) -> bool:
        result = await self.db.execute(
            select(WorkspaceInvite).where(WorkspaceInvite.id == invite_id)
        )
        invite = result.scalar_one_or_none()
        if invite:
            await self.db.delete(invite)
            await self.db.commit()
            return True
        return False

    async def delete_expired(self, workspace_id: str) -> int:
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(WorkspaceInvite)
            .where(
                WorkspaceInvite.workspace_id == workspace_id,
                WorkspaceInvite.expires_at < now
            )
        )
        expired = list(result.scalars().all())
        for invite in expired:
            await self.db.delete(invite)
        await self.db.commit()
        return len(expired)
