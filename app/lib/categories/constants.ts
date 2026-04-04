export const CATEGORIES: Record<string, string[]> = {
  Footwear: ["Sneakers", "Slides", "Boots"],
  Apparel: [
    "T-Shirts", "Long Sleeves", "Hoodies", "Sweatshirts", "Sweaters",
    "Jackets", "Puffer Jackets", "Varsity Jackets", "Vests",
    "Jeans", "Pants", "Sweatpants", "Shorts",
    "Tracksuits", "Jerseys", "Polos",
  ],
  Accessories: ["Handbags", "Saddle Bags", "Messenger Bags", "Backpacks", "Pouches", "Wallets", "Card Holders", "Belts", "Sunglasses"],
  Headwear: ["Caps", "Beanies", "Bucket Hats", "Fitted Hats", "Snapbacks", "Trucker Hats"],
};

export const MAIN_CATEGORIES = Object.keys(CATEGORIES);
