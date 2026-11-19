import ssl
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.config import get_settings

settings = get_settings()

# Convert postgres:// to postgresql+asyncpg://
database_url = settings.database_url.replace("postgresql://", "postgresql+asyncpg://")
# Remove parameters not supported by asyncpg
if "?" in database_url:
    base_url = database_url.split("?")[0]
    database_url = base_url

# Create SSL context for Neon
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

engine = create_async_engine(
    database_url,
    echo=False,
    connect_args={"ssl": ssl_context}
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    from app.core.base import Base
    # Import models to register them
    import app.models.models  # noqa
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
