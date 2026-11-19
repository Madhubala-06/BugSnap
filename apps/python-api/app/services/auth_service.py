from typing import Optional
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import create_access_token
from app.services.user_service import UserService
from app.services.workspace_service import WorkspaceService
from app.services.invite_service import InviteService

settings = get_settings()


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_service = UserService(db)
        self.workspace_service = WorkspaceService(db)
        self.invite_service = InviteService(db)

    async def verify_google_token(self, credential: str) -> Optional[dict]:
        if not settings.google_client_id:
            return None

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={credential}"
            )

            if response.status_code != 200:
                return None

            data = response.json()

            if data.get("aud") != settings.google_client_id:
                return None

            return {
                "email": data.get("email"),
                "name": data.get("name"),
                "avatar_url": data.get("picture"),
                "email_verified": data.get("email_verified") == "true"
            }

    async def signup_with_google(
        self,
        credential: str,
        workspace_name: Optional[str] = None,
        invite_token: Optional[str] = None
    ) -> dict:
        google_user = await self.verify_google_token(credential)
        if not google_user:
            return {"success": False, "error": "Invalid Google credential"}

        email = google_user["email"]
        name = google_user["name"]
        avatar_url = google_user.get("avatar_url")

        existing_user = await self.user_service.get_by_email(email)

        if existing_user:
            user_with_workspace = await self.user_service.get_with_workspace(str(existing_user.id))
            workspace = user_with_workspace.workspace if user_with_workspace else None

            token = create_access_token({
                "sub": str(existing_user.id),
                "email": email,
                "workspace_id": str(existing_user.workspace_id),
                "role": existing_user.role
            })

            return {
                "success": True,
                "access_token": token,
                "token_type": "bearer",
                "user_id": str(existing_user.id),
                "workspace_id": str(existing_user.workspace_id),
                "workspace_slug": workspace.slug if workspace else ""
            }

        workspace_id = None
        workspace_slug = None
        role = "member"

        if invite_token:
            validation = await self.invite_service.validate_token(invite_token, email)
            if not validation["valid"]:
                return {"success": False, "error": validation["error"]}

            invite = validation["invite"]
            workspace_id = str(invite["workspace_id"])
            workspace_slug = invite["workspace"].slug
            role = invite["role"]

            await self.invite_service.mark_as_used(str(invite["id"]))

        elif workspace_name:
            workspace = await self.workspace_service.create(workspace_name)
            workspace_id = str(workspace.id)
            workspace_slug = workspace.slug
            role = "admin"

        else:
            return {"success": False, "error": "Must provide either invite_token or workspace_name"}

        user = await self.user_service.create(
            email=email,
            name=name,
            workspace_id=workspace_id,
            role=role,
            avatar_url=avatar_url
        )

        token = create_access_token({
            "sub": str(user.id),
            "email": email,
            "workspace_id": workspace_id,
            "role": role
        })

        return {
            "success": True,
            "access_token": token,
            "token_type": "bearer",
            "user_id": str(user.id),
            "workspace_id": workspace_id,
            "workspace_slug": workspace_slug
        }

    async def signup_with_email(
        self,
        email: str,
        password: str,
        name: str,
        workspace_name: Optional[str] = None,
        invite_token: Optional[str] = None
    ) -> dict:
        email = email.lower()

        existing_user = await self.user_service.get_by_email(email)
        if existing_user:
            return {"success": False, "error": "Email already registered"}

        workspace_id = None
        workspace_slug = None
        role = "member"

        if invite_token:
            validation = await self.invite_service.validate_token(invite_token, email)
            if not validation["valid"]:
                return {"success": False, "error": validation["error"]}

            invite = validation["invite"]
            workspace_id = str(invite["workspace_id"])
            workspace_slug = invite["workspace"].slug
            role = invite["role"]

            await self.invite_service.mark_as_used(str(invite["id"]))

        elif workspace_name:
            workspace = await self.workspace_service.create(workspace_name)
            workspace_id = str(workspace.id)
            workspace_slug = workspace.slug
            role = "admin"

        else:
            return {"success": False, "error": "Must provide either invite_token or workspace_name"}

        user = await self.user_service.create(
            email=email,
            name=name,
            workspace_id=workspace_id,
            role=role,
            password=password
        )

        token = create_access_token({
            "sub": str(user.id),
            "email": email,
            "workspace_id": workspace_id,
            "role": role
        })

        return {
            "success": True,
            "access_token": token,
            "token_type": "bearer",
            "user_id": str(user.id),
            "workspace_id": workspace_id,
            "workspace_slug": workspace_slug
        }

    async def login_with_email(self, email: str, password: str) -> dict:
        user = await self.user_service.verify_credentials(email, password)

        if not user:
            return {"success": False, "error": "Invalid email or password"}

        user_with_workspace = await self.user_service.get_with_workspace(str(user.id))
        workspace = user_with_workspace.workspace if user_with_workspace else None

        token = create_access_token({
            "sub": str(user.id),
            "email": user.email,
            "workspace_id": str(user.workspace_id),
            "role": user.role
        })

        return {
            "success": True,
            "access_token": token,
            "token_type": "bearer",
            "user_id": str(user.id),
            "workspace_id": str(user.workspace_id),
            "workspace_slug": workspace.slug if workspace else ""
        }

    async def get_me(self, user_id: str) -> Optional[dict]:
        user = await self.user_service.get_with_workspace(user_id)
        if not user:
            return None

        workspace = user.workspace

        return {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "role": user.role,
            "workspace_id": str(user.workspace_id),
            "workspace_name": workspace.name if workspace else "",
            "workspace_slug": workspace.slug if workspace else ""
        }
