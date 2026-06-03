const COMMON_FOODS = [
  { product_name: "Witte rijst (gekookt)", brands: "NEVO", keywords: ["rijst", "rice", "witte rijst"], nutriments: { "energy-kcal_100g": 130, proteins_100g: 2.7, carbohydrates_100g: 28.2, fat_100g: 0.3 } },
  { product_name: "Zilvervliesrijst (gekookt)", brands: "NEVO", keywords: ["rijst", "rice", "zilvervlies", "brown rice", "bruine rijst"], nutriments: { "energy-kcal_100g": 123, proteins_100g: 2.6, carbohydrates_100g: 25.6, fat_100g: 0.9 } },
  { product_name: "Pasta (gekookt)", brands: "NEVO", keywords: ["pasta", "spaghetti", "macaroni", "penne"], nutriments: { "energy-kcal_100g": 157, proteins_100g: 5.5, carbohydrates_100g: 31.2, fat_100g: 0.9 } },
  { product_name: "Havermout (droog)", brands: "NEVO", keywords: ["havermout", "oats", "oatmeal", "haver"], nutriments: { "energy-kcal_100g": 368, proteins_100g: 12.5, carbohydrates_100g: 61.8, fat_100g: 7.1 } },
  { product_name: "Volkoren brood", brands: "NEVO", keywords: ["brood", "bread", "volkoren", "wholegrain", "wholemeal"], nutriments: { "energy-kcal_100g": 247, proteins_100g: 8.5, carbohydrates_100g: 41.4, fat_100g: 3.5 } },
  { product_name: "Wit brood", brands: "NEVO", keywords: ["brood", "bread", "wit brood", "white bread"], nutriments: { "energy-kcal_100g": 265, proteins_100g: 7.9, carbohydrates_100g: 49.9, fat_100g: 3.0 } },
  { product_name: "Aardappel (gekookt)", brands: "NEVO", keywords: ["aardappel", "potato", "aardappelen"], nutriments: { "energy-kcal_100g": 77, proteins_100g: 2.1, carbohydrates_100g: 17.0, fat_100g: 0.1 } },
  { product_name: "Zoete aardappel (gekookt)", brands: "NEVO", keywords: ["zoete aardappel", "sweet potato", "bataat"], nutriments: { "energy-kcal_100g": 90, proteins_100g: 1.6, carbohydrates_100g: 20.7, fat_100g: 0.1 } },
  { product_name: "Kipfilet (bereid)", brands: "NEVO", keywords: ["kip", "kipfilet", "chicken", "chicken breast", "kipborst"], nutriments: { "energy-kcal_100g": 165, proteins_100g: 31.0, carbohydrates_100g: 0, fat_100g: 3.6 } },
  { product_name: "Kip (geheel, bereid)", brands: "NEVO", keywords: ["kip", "chicken", "whole chicken"], nutriments: { "energy-kcal_100g": 215, proteins_100g: 27.0, carbohydrates_100g: 0, fat_100g: 11.6 } },
  { product_name: "Rundergehakt (mager)", brands: "NEVO", keywords: ["gehakt", "rundergehakt", "beef", "ground beef", "minced beef"], nutriments: { "energy-kcal_100g": 218, proteins_100g: 26.0, carbohydrates_100g: 0, fat_100g: 12.0 } },
  { product_name: "Zalmfilet (bereid)", brands: "NEVO", keywords: ["zalm", "salmon", "zalmfilet"], nutriments: { "energy-kcal_100g": 208, proteins_100g: 20.4, carbohydrates_100g: 0, fat_100g: 13.4 } },
  { product_name: "Tonijn in water", brands: "NEVO", keywords: ["tonijn", "tuna", "tun"], nutriments: { "energy-kcal_100g": 116, proteins_100g: 25.5, carbohydrates_100g: 0, fat_100g: 1.0 } },
  { product_name: "Ei (heel, ~60g)", brands: "NEVO", keywords: ["ei", "egg", "eieren", "eggs", "whole egg"], nutriments: { "energy-kcal_100g": 143, proteins_100g: 12.6, carbohydrates_100g: 0.7, fat_100g: 9.9 } },
  { product_name: "Eiwitten (alleen eiwit)", brands: "NEVO", keywords: ["eiwit", "egg white", "eiwitten"], nutriments: { "energy-kcal_100g": 52, proteins_100g: 10.9, carbohydrates_100g: 0.7, fat_100g: 0.2 } },
  { product_name: "Melk (halfvol)", brands: "NEVO", keywords: ["melk", "milk", "halfvolle melk"], nutriments: { "energy-kcal_100g": 46, proteins_100g: 3.3, carbohydrates_100g: 4.7, fat_100g: 1.5 } },
  { product_name: "Griekse yoghurt (0%)", brands: "NEVO", keywords: ["yoghurt", "greek yogurt", "griekse yoghurt", "skyr"], nutriments: { "energy-kcal_100g": 59, proteins_100g: 10.0, carbohydrates_100g: 3.6, fat_100g: 0.4 } },
  { product_name: "Kwark (mager)", brands: "NEVO", keywords: ["kwark", "quark", "magere kwark"], nutriments: { "energy-kcal_100g": 67, proteins_100g: 11.0, carbohydrates_100g: 4.0, fat_100g: 0.2 } },
  { product_name: "Kaas (48+)", brands: "NEVO", keywords: ["kaas", "cheese", "gouda", "cheddar"], nutriments: { "energy-kcal_100g": 357, proteins_100g: 25.0, carbohydrates_100g: 0, fat_100g: 28.0 } },
  { product_name: "Kaas (30+)", brands: "NEVO", keywords: ["kaas", "cheese", "30+", "light kaas"], nutriments: { "energy-kcal_100g": 261, proteins_100g: 25.0, carbohydrates_100g: 0, fat_100g: 17.0 } },
  { product_name: "Cottage cheese", brands: "NEVO", keywords: ["cottage cheese", "cottage"], nutriments: { "energy-kcal_100g": 98, proteins_100g: 11.1, carbohydrates_100g: 3.4, fat_100g: 4.3 } },
  { product_name: "Broccoli (bereid)", brands: "NEVO", keywords: ["broccoli"], nutriments: { "energy-kcal_100g": 35, proteins_100g: 2.4, carbohydrates_100g: 4.0, fat_100g: 0.4 } },
  { product_name: "Spinazie (bereid)", brands: "NEVO", keywords: ["spinazie", "spinach"], nutriments: { "energy-kcal_100g": 23, proteins_100g: 2.9, carbohydrates_100g: 0.4, fat_100g: 0.4 } },
  { product_name: "Sperziebonen (bereid)", brands: "NEVO", keywords: ["sperziebonen", "green beans", "boontjes"], nutriments: { "energy-kcal_100g": 31, proteins_100g: 1.8, carbohydrates_100g: 4.4, fat_100g: 0.3 } },
  { product_name: "Banaan", brands: "NEVO", keywords: ["banaan", "banana"], nutriments: { "energy-kcal_100g": 89, proteins_100g: 1.1, carbohydrates_100g: 22.8, fat_100g: 0.3 } },
  { product_name: "Appel", brands: "NEVO", keywords: ["appel", "apple"], nutriments: { "energy-kcal_100g": 52, proteins_100g: 0.3, carbohydrates_100g: 13.8, fat_100g: 0.2 } },
  { product_name: "Pindakaas", brands: "NEVO", keywords: ["pindakaas", "peanut butter", "pb"], nutriments: { "energy-kcal_100g": 588, proteins_100g: 25.0, carbohydrates_100g: 20.0, fat_100g: 46.0 } },
  { product_name: "Amandelen", brands: "NEVO", keywords: ["amandelen", "almonds", "noten", "nuts"], nutriments: { "energy-kcal_100g": 579, proteins_100g: 21.2, carbohydrates_100g: 21.6, fat_100g: 49.9 } },
  { product_name: "Olijfolie", brands: "NEVO", keywords: ["olijfolie", "olive oil", "olie", "oil"], nutriments: { "energy-kcal_100g": 884, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 100 } },
  { product_name: "Boter", brands: "NEVO", keywords: ["boter", "butter"], nutriments: { "energy-kcal_100g": 717, proteins_100g: 0.5, carbohydrates_100g: 0.6, fat_100g: 81.1 } },
];

export function searchCommon(query: string) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return COMMON_FOODS.filter(f =>
    f.product_name.toLowerCase().includes(q) ||
    f.keywords.some(k => k.includes(q) || q.includes(k))
  );
}
