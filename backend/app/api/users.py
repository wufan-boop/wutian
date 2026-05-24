from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional

from ..core.database import get_db
from ..core.deps import get_current_user
from ..core.security import hash_password
from ..models.user import User

router = APIRouter(prefix="/api/users", tags=["users"])


def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可操作")
    return current_user


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "user"
    display_name: Optional[str] = None


class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None
    display_name: Optional[str] = None
    is_active: Optional[bool] = None


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    display_name: Optional[str]
    is_active: bool
    created_at: str

    class Config:
        from_attributes = True


@router.get("", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    users = db.query(User).order_by(User.created_at).all()
    return [UserOut(
        id=u.id,
        username=u.username,
        role=u.role,
        display_name=getattr(u, "display_name", None),
        is_active=getattr(u, "is_active", True),
        created_at=str(u.created_at)[:19],
    ) for u in users]


@router.post("", response_model=UserOut)
def create_user(body: UserCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="用户名已存在")
    user = User(
        username=body.username,
        hashed_pw=hash_password(body.password),
        role=body.role,
    )
    if hasattr(User, "display_name"):
        user.display_name = body.display_name or body.username
    if hasattr(User, "is_active"):
        user.is_active = True
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut(
        id=user.id,
        username=user.username,
        role=user.role,
        display_name=getattr(user, "display_name", user.username),
        is_active=getattr(user, "is_active", True),
        created_at=str(user.created_at)[:19],
    )


@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if body.password:
        user.hashed_pw = hash_password(body.password)
    if body.role:
        user.role = body.role
    if body.display_name is not None and hasattr(user, "display_name"):
        user.display_name = body.display_name
    if body.is_active is not None and hasattr(user, "is_active"):
        user.is_active = body.is_active
    db.commit()
    db.refresh(user)
    return UserOut(
        id=user.id,
        username=user.username,
        role=user.role,
        display_name=getattr(user, "display_name", user.username),
        is_active=getattr(user, "is_active", True),
        created_at=str(user.created_at)[:19],
    )


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能删除自己")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    db.delete(user)
    db.commit()
    return {"ok": True}
