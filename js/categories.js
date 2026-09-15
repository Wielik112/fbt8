/* ============================================
   FBT OUTLET — Category tree (single source of truth)
   --------------------------------------------
   Dodanie podkategorii = jedna linijka w tablicy poniżej.
   Wartość podkategorii to jednocześnie `cat` produktu.
   Kolejność w tablicy = kolejność w menu i filtrach.
   ============================================ */
window.CATEGORY_TREE = [
  { name: 'Obuwie',      subs: ['Buty', 'Buty sportowe', 'Trampki'] },
  { name: 'Odzież',      subs: ['Koszulki', 'Kurtki', 'Bluzy', 'Spodnie', 'Dresy sportowe', 'Czapki'] },
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

/* ============================================
   Siatki rozmiarów (jedno źródło dla sklepu i panelu).
   Dodanie/zmiana rozmiaru = edycja tablicy poniżej.
   ============================================ */
window.SIZE_SETS = {
  // Buty — pełne, połówki Nike (44,5) i Adidasa (42 2/3, 43 1/3).
  shoe: [
    '35', '35,5',
    '36', '36,5', '36 2/3',
    '37', '37 1/3', '37,5',
    '38', '38,5', '38 2/3',
    '39', '39 1/3', '39,5',
    '40', '40,5', '40 2/3',
    '41', '41 1/3', '41,5',
    '42', '42,5', '42 2/3',
    '43', '43 1/3', '43,5',
    '44', '44,5', '44 2/3',
    '45', '45 1/3', '45,5',
    '46', '46,5', '46 2/3',
    '47', '47 1/3', '47,5',
    '48', '48,5', '48 2/3',
  ],
  apparel: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  glove:   ['4', '5', '6', '7', '8', '8,5', '9', '9,5', '10', '10,5', '11'],
  ball:    ['3', '4', '5'],
  accessory: ['3', '4', '5', 'XS', 'S', 'M', 'L', 'XL', 'Uniwersalny'],
};

// Zwraca nazwę zestawu rozmiarów pasującego do danej podkategorii.
window.sizeSetFor = function (cat) {
  if (['Buty', 'Buty sportowe', 'Trampki', 'Buty piłkarskie'].includes(cat)) return 'shoe';
  if (['Koszulki', 'Kurtki', 'Bluzy', 'Spodnie', 'Dresy sportowe', 'Czapki'].includes(cat)) return 'apparel';
  if (cat === 'Rękawice bramkarskie') return 'glove';
  if (cat === 'Akcesoria piłkarskie') return 'accessory';
  return 'apparel';
};
