export type OrderType = 'PICKUP' | 'RECEIVE' | 'DELIVERY';
export type OrderStatus = 'PENDING' | 'HELD' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'RETURNED';
export interface OrderLine { productId: string; quantity: number; unitPrice?: number; discount?: number; }
export interface Order {
  id: string; orderNumber: number; orderType: OrderType; status: OrderStatus;
  total: number; totalItems: number; totalQuantity: number;
}
