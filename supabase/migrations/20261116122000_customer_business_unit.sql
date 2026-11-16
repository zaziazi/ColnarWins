-- Poslovna enota: a company with several venues has one customer row per venue (same VAT id).
alter table customer add column if not exists business_unit text;
comment on column customer.business_unit is 'Poslovna enota: which location of a company this customer row is (a company with several venues has one row per venue, same VAT id).';
