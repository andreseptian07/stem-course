export type NotificationKind = "access" | "invitation" | "class" | "task" | "review" | "submission" | "announcement" | "session" | "reminder";
export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  href: string;
  createdAt: string;
  readAt: string | null;
};
export type NotificationFeed = {
  items: NotificationItem[];
  unreadCount: number;
  limit: number;
};
