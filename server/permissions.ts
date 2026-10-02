export const roles = ['Management','Team Lead','Customer Service & Sales','Shopify Store Manager','Performance Marketing','Warehouse','Delivery','Installer','Accounts'] as const;
export type Role = typeof roles[number];
export type Staff = {id:string;name:string;email:string;role:Role;department:string;active:boolean};
export type Permission = 'commerce.read'|'customers.write'|'orders.write'|'invoices.write'|'payments.write'|'approvals.write'|'catalogue.write'|'inventory.write'|'settings.write'|'users.write'|'audit.read'|'reports.read'|'delivery.read'|'assembly.read';
const grants:Record<Role,Permission[]> = {
  Management:['commerce.read','customers.write','orders.write','invoices.write','payments.write','approvals.write','catalogue.write','inventory.write','settings.write','users.write','audit.read','reports.read','delivery.read','assembly.read'],
  'Team Lead':['commerce.read','customers.write','orders.write','invoices.write','approvals.write','catalogue.write','inventory.write','audit.read','reports.read','delivery.read','assembly.read'],
  'Customer Service & Sales':['commerce.read','customers.write','orders.write','invoices.write','delivery.read'],
  'Shopify Store Manager':['catalogue.write'], 'Performance Marketing':['reports.read'],
  Warehouse:['inventory.write'], Delivery:['delivery.read'], Installer:['assembly.read'],
  Accounts:['commerce.read','invoices.write','payments.write','reports.read'],
};
export function hasPermission(staff:Staff,permission:Permission) {return staff.active && !!grants[staff.role]?.includes(permission);}
export class AppError extends Error {constructor(public status:number,public code:string,message:string){super(message);}}
export function authorize(staff:Staff,permission:Permission) {if(!hasPermission(staff,permission)) throw new AppError(403,'FORBIDDEN','You do not have permission for this action.');}
