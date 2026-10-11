ALTER TABLE `clientes` ADD `numero_predio` text;--> statement-breakpoint
CREATE UNIQUE INDEX `clientes_numero_predio_unique` ON `clientes` (`numero_predio`);