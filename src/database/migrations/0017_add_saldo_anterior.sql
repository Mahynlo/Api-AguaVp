ALTER TABLE `clientes` ADD `saldo_anterior` numeric DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `facturas` ADD `cargo_saldo_anterior` numeric DEFAULT 0 NOT NULL;