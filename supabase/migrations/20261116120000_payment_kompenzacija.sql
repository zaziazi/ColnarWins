-- "Kompenzacija" (the debt is settled against something the customer owes us, or we owe them)
-- becomes a payment method next to TRR, cash, card and other.
alter table sales_order drop constraint sales_order_payment_method_check;
alter table sales_order add constraint sales_order_payment_method_check
  check (payment_method = any (array['trr','gotovina','kartica','drugo','kompenzacija']));

alter table group_booking drop constraint group_booking_income_payment_method_check;
alter table group_booking add constraint group_booking_income_payment_method_check
  check (income_payment_method = any (array['trr','gotovina','kartica','drugo','kompenzacija']));
