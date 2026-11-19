from app.routers.auth import router as auth_router
from app.routers.workspaces import router as workspaces_router
from app.routers.users import router as users_router
from app.routers.teams import router as teams_router
from app.routers.invites import router as invites_router
from app.routers.bug_reports import router as bug_reports_router
from app.routers.sessions import router as sessions_router

__all__ = [
    "auth_router",
    "workspaces_router",
    "users_router",
    "teams_router",
    "invites_router",
    "bug_reports_router",
    "sessions_router",
]
