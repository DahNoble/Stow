import React from 'react';
import { Link } from 'react-router-dom';

export type NotificationType =
  | 'deposit'
  | 'withdrawal'
  | 'yield-earned'
  | 'system';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  read?: boolean;
  /** Amount earned, present for yield-earned notifications. */
  amount?: string;
  /** Asset symbol for the earned amount, e.g. "USDC". */
  asset?: string;
}

interface NotificationCenterProps {
  notifications: Notification[];
  onMarkRead?: (id: string) => void;
}

function formatAmount(amount?: string, asset?: string): string | null {
  if (amount === undefined || amount === null || amount === '') {
    return null;
  }
  return asset ? `${amount} ${asset}` : amount;
}

function YieldEarnedBody({ notification }: { notification: Notification }) {
  const formatted = formatAmount(notification.amount, notification.asset);
  return (
    <div className="notification-body">
      {formatted && (
        <p className="notification-amount">
          Earned <strong>{formatted}</strong>
        </p>
      )}
      <Link to="/harvest-history" className="notification-link">
        View harvest history
      </Link>
    </div>
  );
}

function NotificationBody({ notification }: { notification: Notification }) {
  switch (notification.type) {
    case 'yield-earned':
      return <YieldEarnedBody notification={notification} />;
    default:
      return <p className="notification-message">{notification.message}</p>;
  }
}

export function NotificationCenter({
  notifications,
  onMarkRead,
}: NotificationCenterProps) {
  if (notifications.length === 0) {
    return (
      <div className="notification-center notification-center--empty">
        <p>No notifications yet.</p>
      </div>
    );
  }

  return (
    <ul className="notification-center">
      {notifications.map((notification) => (
        <li
          key={notification.id}
          className={`notification notification--${notification.type}${
            notification.read ? ' notification--read' : ''
          }`}
        >
          <div className="notification-header">
            <span className="notification-title">{notification.title}</span>
            <time className="notification-time" dateTime={notification.createdAt}>
              {notification.createdAt}
            </time>
          </div>
          <NotificationBody notification={notification} />
          {!notification.read && onMarkRead && (
            <button
              type="button"
              className="notification-mark-read"
              onClick={() => onMarkRead(notification.id)}
            >
              Mark as read
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export default NotificationCenter;
