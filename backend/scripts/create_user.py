#!/usr/bin/env python
"""
用法：python scripts/create_user.py <用户名> <密码> [admin|member]
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.database import Base, engine, SessionLocal
from app.core.security import hash_password
from app.models.user import User

Base.metadata.create_all(bind=engine)


def create_user(username: str, password: str, role: str = "member"):
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == username).first()
        if existing:
            print(f"错误：用户 '{username}' 已存在")
            return
        user = User(username=username, hashed_pw=hash_password(password), role=role)
        db.add(user)
        db.commit()
        print(f"✓ 用户 '{username}'（{role}）创建成功")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("用法：python scripts/create_user.py <用户名> <密码> [admin|member]")
        sys.exit(1)
    uname = sys.argv[1]
    pwd = sys.argv[2]
    r = sys.argv[3] if len(sys.argv) > 3 else "member"
    create_user(uname, pwd, r)
