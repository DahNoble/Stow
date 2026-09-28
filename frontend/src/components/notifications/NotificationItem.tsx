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
  /** Amount earned, present on yield-earned notifications. */
  amount?: string;
  /** Asset/token symbol for the amount, e.g. "USDC". */
  asset?: string;
}

interface NotificationItemProps {
  notification: Notification;
  onMarkRead?: (id: string) => void;
}

const formatAmount = (amount?: string, asset?: string): string | null => {
  if (amount === undefined || amount === null || amount === '') {
    return null;
  }
  return asset ? `${amount} ${asset}` : amount;
};

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkRead,
}) => {
  const { id, type, title, message, createdAt, read, amount, asset } = notification;

  const handleClick = () => {
    if (!read && onMarkRead) {
      onMarkRead(id);
    }
  };

  const renderBody = () => {
    switch (type) {
      case 'yield-earned': {
        const formatted = formatAmount(amount, asset);
        return (
          <div className="notification-item__body">
            <p className="notification-item__message">{message}</p>
            {formatted && (
              <p className="notification-item__amount">
                Earned: <strong>{formatted}</strong>
              </p>
            )}
            <Link
              to="/harvest-history"
              className="notification-item__link"
              onClick={(event) => event.stopPropagation()}
            >
              View harvest history
            </Link>
          </div>
        );
      }
      default:
        return (
          <div className="notification-item__body">
            <p className="notification-item__message">{message}</p>
          </div>
        );
    }
  };

  return (
    <li
      className={`notification-item notification-item--${type}${
        read ? ' notification-item--read' : ''
      }`}
      onClick={handleClick}
    >
      <div className="notification-item__header">
        <span className="notification-item__title">{title}</span>
        <time className="notification-item__time" dateTime={createdAt}>
          {new Date(createdAt).toLocaleString()}
        </time>
      </div>
      {renderBody()}
    </li>
  );
};

export default NotificationItem;
