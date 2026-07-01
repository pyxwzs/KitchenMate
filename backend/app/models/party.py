import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin


class PartyStatus(str, enum.Enum):
    ACTIVE = "active"
    CLOSED = "closed"


class Party(Base, TimestampMixin):
    __tablename__ = "parties"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"), index=True, nullable=False)
    host_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    join_code: Mapped[str] = mapped_column(String(8), unique=True, index=True, nullable=False)
    status: Mapped[PartyStatus] = mapped_column(
        Enum(PartyStatus, values_callable=lambda x: [e.value for e in x]),
        default=PartyStatus.ACTIVE,
        nullable=False,
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    guests: Mapped[list["PartyGuest"]] = relationship(
        back_populates="party", cascade="all, delete-orphan"
    )


from app.models.user import User


class PartyGuest(Base, TimestampMixin):
    __tablename__ = "party_guests"
    __table_args__ = (UniqueConstraint("party_id", "user_id", name="uq_party_guest"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    party_id: Mapped[int] = mapped_column(ForeignKey("parties.id"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)

    party: Mapped["Party"] = relationship(back_populates="guests")
    user: Mapped["User"] = relationship()
