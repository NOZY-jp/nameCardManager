from fastapi import APIRouter

from app.api.v1.endpoints import auth, images, namecards, search

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(images.router, prefix="/images", tags=["images"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(namecards.router, prefix="/namecards", tags=["namecards"])
