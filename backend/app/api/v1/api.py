from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth,
    export,
    images,
    import_,
    namecards,
    relationships,
    search,
    tags,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(images.router, prefix="/images", tags=["images"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(namecards.router, prefix="/namecards", tags=["namecards"])
api_router.include_router(tags.router, prefix="/tags", tags=["tags"])
api_router.include_router(
    relationships.router, prefix="/relationships", tags=["relationships"]
)
api_router.include_router(export.router, prefix="/export", tags=["export"])
api_router.include_router(import_.router, prefix="/import", tags=["import"])
