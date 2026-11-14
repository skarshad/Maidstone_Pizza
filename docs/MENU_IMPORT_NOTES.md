# Menu import notes

Captured from `https://www.pizzagogo.co.uk/menu/...` on 2026-11-13, on the owner's confirmation that they have the right to reuse the menu content.

## How the import works

| Step       | Command            | Reads                                            | Writes                                                                |
| ---------- | ------------------ | ------------------------------------------------ | --------------------------------------------------------------------- |
| 1. Capture | `pnpm menu:import` | the source site (cached in `.cache/menu-import`) | `data/menu.source.json`: exactly what the site shows, nothing changed |
| 2. Build   | `pnpm menu:build`  | `menu.source.json` + `data/menu.overrides.json`  | `data/menu.seed.json`: the normalised menu                            |
| 3. Load    | `pnpm menu:seed`   | `menu.seed.json`                                 | the Supabase database                                                 |

Owner decisions (renames, the toppings list, exclusions) live in `data/menu.overrides.json`. Edit that file and re-run steps 2 and 3; never edit the other two JSON files by hand.

`pnpm menu:seed` only adds what is missing. It does not overwrite prices or names edited in the admin portal unless run with `--overwrite`, and it never changes published, sold-out or allergen data.

## What was captured

| Category         | Items                    | Notes                                                |
| ---------------- | ------------------------ | ---------------------------------------------------- |
| Pizzas           | 23                       | 3 sizes each, price per size read from the item page |
| Sides & Starters | 12                       | single price                                         |
| Pastas           | 4                        | single price                                         |
| Desserts         | 12                       | single price                                         |
| Drinks           | 10                       | single price                                         |
| Dips             | 5                        | single price                                         |
| **Total**        | **66 items, 112 prices** |                                                      |

Shared pizza choices, identical on all 23 pizza pages (the build fails if they ever differ):

- **Sizes:** 10" Small (6 slices), 12" Medium (8 slices), 15" Large (10 slices).
- **Base:** Thin, Deep Pan (no extra charge), or stuffed crust with Cheese, Garlic and Herbs, or Hot Dog at £1.20 / £1.60 / £2.00 for small / medium / large.
- **Extra toppings:** £1.00 / £1.20 / £1.40 each for small / medium / large.

Every price in the seed was read from the item page and cross-checked against a second place on the same page (the size label or the listing price). The build stops rather than guess if they disagree. No price was estimated.

## Changes made for the rebrand

| Source                                         | Now                                                   | Why                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| GoGo Special                                   | **Maidstone Special**                                 | Carried the source brand's name. The new name is a suggestion; change it in `menu.overrides.json`. |
| "Flaming Torch Pizza - Pepperoni…"             | "Pepperoni…"                                          | Removed the repeated name from the description.                                                    |
| "You'll love our New Yorker! …" and "¡Hola! …" | plain ingredient lists                                | Removed the source's marketing voice.                                                              |
| Create Your Own: "Build your own pizza! …"     | "Cheese & Tomato plus any 4 toppings of your choice." | Same.                                                                                              |

No other names or descriptions were changed. The build warns if any item still mentions the source brand; none do.

## Needs the owner's decision

### 1. Allergens: none imported (important)

The source site publishes no allergen data. Its allergen page says the information "is being updated and will be added here soon". **Nothing has been guessed.** Every item is marked "allergens not confirmed", and the website tells customers to contact the shop for those items.

Before launch, each item needs its allergens entered from supplier and recipe information and ticked as confirmed in the admin portal (Menu > item > Allergens). Bases, crusts and toppings need theirs too; that editor comes with the admin work in Phase 6. UK law requires allergen information to be available for all 14 allergens, so this blocks go-live.

### 2. Toppings list: derived, not copied

The source only shows its toppings list after a store is chosen, through a part of the site its `robots.txt` asks automated tools not to read, so it was not captured. The 27 toppings in the seed are the ingredients named in the pizza descriptions (plus "Extra Cheese"). Please confirm or correct the list. The prices are from the source.

### 3. How many extra toppings a customer may add

The source sets a per-pizza topping limit that always equals the pizza's own toppings plus two. The seed therefore allows **up to 2 extra toppings** on each standard pizza. Create Your Own allows **6 toppings, 4 included in the price**. If the limit should be different, say so; it is one number in `menu.overrides.json` and editable per item in admin.

If a pizza ever includes free toppings that cost different amounts, the cheapest chosen ones are treated as the free ones. All toppings cost the same today, so this has no effect yet.

### 4. Branded products you may not stock

These 18 items carry other companies' brand names. That is normal for a shop that sells those products, but please confirm you stock each one. Hide any you don't in the admin portal.

- Ben & Jerry's (4 tubs), Häagen-Dazs (5 tubs)
- Coke, Diet Coke, Coke Zero, 7UP, Fanta cans; Coke, Diet Coke, 7UP, Fanta bottles

### 5. Deals: recorded, not loaded

Special Offers and the "3 Dipping Pots" deal are recorded in `menu.seed.json` under `deals` for reference only. They become promotions in Phase 5. The source hides most deal prices until a store is chosen, so they need the owner's figures:

| Deal            | Description                                                  | Price seen |
| --------------- | ------------------------------------------------------------ | ---------- |
| Care Package    | Any 2 Pizzas + Any 2 Sides                                   | not shown  |
| 2's Special     | Any two pizzas at a discount                                 | not shown  |
| 3's Special     | Any three pizzas at a discount                               | not shown  |
| The Single Deal | Any pizza, any starter or side, 2 dips, 2 drinks (330ml)     | not shown  |
| The Twin Deal   | Any 2 pizzas, any 2 starters or sides, 2 dips, a bottle      | not shown  |
| The Triple Deal | Any 3 medium pizzas, any 3 sides or starters, any 3 big dips | £35.99     |
| 3 Dipping Pots  | Any 3 big dipping pots                                       | from £0.99 |

### 6. Photos: none downloaded

The source's product photos were not downloaded, because the brief allows this only where you are entitled to reuse them and that has not been confirmed for the images. Menu cards use a brand pattern until an item has a photo. Upload your own photos or GIFs (JPG, PNG, WebP or GIF, up to 5 MB) in the admin portal: Menu > open an item > Photo.

### 7. Smaller points

- **Calories:** the source shows kcal figures. They are kept in `menu.source.json` but not shown on the site, because they describe the source's recipes, not necessarily yours.
- **VAT:** every item is set to 20%. Confirm with your accountant, particularly for cold items.
- **Source size names** such as `10" Small (6 slices)` are kept as written.
- **Default base:** the site pre-selects the first base (Thin). The source pre-selected Deep Pan.
