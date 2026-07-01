import enum


class OrderStatus(str, enum.Enum):
    OPEN = "open"


ORDER_STATUS_LABELS = {
    OrderStatus.OPEN: "点餐中",
}
