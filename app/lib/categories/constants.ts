export const CATEGORIES: Record<string, string[]> = {
  Footwear: ["Sneakers", "Athletic Shoes", "Boots", "Sandals", "Slides", "Loafers", "Heels"],
  Apparel: [
    "T-Shirts", "Long Sleeves", "Hoodies", "Sweatshirts", "Sweaters",
    "Jackets", "Puffer Jackets", "Parkas", "Varsity Jackets", "Vests",
    "Jeans", "Pants", "Sweatpants", "Shorts", "Jogger Shorts",
    "Jerseys", "Polos", "Outfit Sets",
  ],
  Accessories: ["Bags", "Wallets", "Belts", "Sunglasses", "Jewelry", "Watches"],
  Headwear: ["Caps", "Beanies", "Bucket Hats", "Fitted Hats", "Snapbacks", "Trucker Hats"],
};

export const MAIN_CATEGORIES = Object.keys(CATEGORIES);
