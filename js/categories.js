/* ============================================
   FBT OUTLET — Category tree (single source of truth)
   --------------------------------------------
   Dodanie podkategorii = jedna linijka w tablicy poniżej.
   Wartość podkategorii to jednocześnie `cat` produktu.
   Kolejność w tablicy = kolejność w menu i filtrach.
   ============================================ */
window.CATEGORY_TREE = [
  { name: 'Obuwie',      subs: ['Buty', 'Buty sportowe', 'Trampki'] },
  { name: 'Odzież',      subs: ['Kurtki', 'Bluzy', 'Spodnie', 'Dresy sportowe', 'Czapki'] },
  { name: 'Piłka nożna', subs: ['Buty piłkarskie', 'Rękawice bramkarskie', 'Akcesoria piłkarskie'] },
];

// Wszystkie „liście" (dozwolone wartości product.cat), w kolejności drzewa.
window.CATEGORY_LEAVES = window.CATEGORY_TREE.flatMap((g) => g.subs);

// Zwraca nazwę kategorii głównej dla danej podkategorii (liścia) lub ''.
window.mainCategoryOf = function (leaf) {
  const g = window.CATEGORY_TREE.find((g) => g.subs.includes(leaf));
  return g ? g.name : '';
};

// Kategorie główne, które są obuwiem (dla siatki rozmiarów butów).
window.FOOTWEAR_MAIN = ['Obuwie', 'Piłka nożna'];
