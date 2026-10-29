-- Engångsrättning: kategoribudgetarna är en uppdelning av totalbudgeten, så projektets budget får inte
-- vara lägre än summan av dem. Höj totalbudgeten till summan där den hamnat under (t.ex. 1 500 kr med
-- kategorier som summerar till 2 000 kr). Projekt där summan är lägre eller saknas lämnas orörda.
UPDATE `projects`
SET
	`budget_ore` = (SELECT SUM(`budget_ore`) FROM `project_budgets` WHERE `project_budgets`.`project_id` = `projects`.`id`),
	`updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE `budget_ore` < COALESCE((SELECT SUM(`budget_ore`) FROM `project_budgets` WHERE `project_budgets`.`project_id` = `projects`.`id`), 0);
