-- The office prepares the invoice before the delivery and the driver is told; invoiced_at stays "issued after delivery".
alter table sales_order add column if not exists invoice_ready_at timestamptz;
comment on column sales_order.invoice_ready_at is 'Office has prepared the invoice (in e-računi); the driver is told and brings it along. Not the same as invoiced_at, which is set after delivery.';
