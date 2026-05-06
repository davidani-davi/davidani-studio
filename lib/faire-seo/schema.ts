export type FaireFieldType =
  | "single_select"
  | "multi_select"
  | "free_text"
  | "number"
  | "boolean"
  | "country_select"
  | "dynamic_tag_input";

export type Confidence = "high" | "medium" | "needs_confirmation" | "missing";

export interface FaireSchemaField {
  id: string;
  label: string;
  type: FaireFieldType;
  options: string[];
  maxSelections?: number;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  visible: boolean;
  sortableOrder: number;
}

export interface ExtractedField {
  id: string;
  label: string;
  value: string;
  confidence: Confidence;
  source: "screenshot" | "image" | "inferred" | "user" | "missing";
  notes?: string;
}

export interface FaireSeoScore {
  titleSeo: number;
  keywordCoverage: number;
  retailerClarity: number;
  metadataQuality: number;
  boutiquePositioning: number;
  descriptionStrength: number;
  imageReadiness: number;
  plusSizeOptimization: number;
  overallFaireOptimization: number;
}

export interface FaireSeoResult {
  listingId: string;
  styleNumber: string;
  plusStyleNumber: string;
  extractedFields: ExtractedField[];
  originalTitle: string;
  originalDescription: string;
  optimizedFields: Record<string, string>;
  optimizedTitle: string;
  plusOptimizedTitle: string;
  optimizedDescription: string;
  plusOptimizedDescription: string;
  metadataSelections: Record<string, string | string[] | boolean | number>;
  seoKeywordStrategy: string[];
  productDetailRecommendations: string[];
  imageOrder: string[];
  beforeScore: FaireSeoScore;
  afterScore: FaireSeoScore;
  scoreRationale: string[];
  finalCopySheet: string;
  updatedAt: string;
}

export interface FaireUploadedAsset {
  id: string;
  name: string;
  url: string;
  hash: string;
  role:
    | "listing_screenshot"
    | "product_photo"
    | "colorway_photo"
    | "detail_shot"
    | "matching_set_photo"
    | "plus_screenshot"
    | "trending_keyword_reference";
}

export const DEFAULT_FAIRE_SCHEMA: FaireSchemaField[] = [
  {
    id: "aesthetic",
    label: "Aesthetic",
    type: "multi_select",
    options: [
      "Active",
      "Bohemian",
      "Casual",
      "Classic",
      "Glam",
      "Gothic",
      "Grunge",
      "Minimalist",
      "Outdoor",
      "Preppy",
      "Retro / vintage",
      "Romantic / whimsical",
      "Streetwear",
      "Western",
    ],
    maxSelections: 2,
    required: false,
    placeholder: "Choose up to 2 accurate aesthetics",
    helpText: "Use only if visually accurate. Accuracy beats tag volume.",
    visible: true,
    sortableOrder: 10,
  },
  {
    id: "care_instructions",
    label: "Care Instructions",
    type: "single_select",
    options: ["Do not wash", "Dry clean only", "Hand wash", "Machine wash", "Spot Clean"],
    required: false,
    placeholder: "Select confirmed care only",
    visible: true,
    sortableOrder: 20,
  },
  {
    id: "embellishment",
    label: "Embellishment",
    type: "multi_select",
    options: [
      "Back Detail",
      "Beaded",
      "Broderie",
      "Cable Knit",
      "Embossed",
      "Embroidered",
      "Fringe",
      "Fur Trim",
      "Jeweled",
      "Lace",
      "Pearled",
      "Piping",
      "Pleat",
      "Pom Pom",
      "Quilted",
      "Ribbon",
      "Ruffles",
      "Sequined",
      "Studded",
      "Tassels",
    ],
    required: false,
    placeholder: "Select visible embellishments only",
    visible: true,
    sortableOrder: 30,
  },
  {
    id: "fabric",
    label: "Fabric",
    type: "free_text",
    options: [],
    required: false,
    placeholder: "Confirmed composition or Needs confirmation",
    visible: true,
    sortableOrder: 40,
  },
  {
    id: "fit",
    label: "Fit",
    type: "multi_select",
    options: ["Contemporary", "Junior", "Maternity", "Missy"],
    required: false,
    placeholder: "Market category style",
    visible: true,
    sortableOrder: 50,
  },
  {
    id: "made_in",
    label: "Made In",
    type: "country_select",
    options: [],
    required: false,
    placeholder: "Country of origin",
    visible: true,
    sortableOrder: 60,
  },
];

export const CORE_EXTRACTION_FIELDS: Omit<ExtractedField, "value" | "confidence" | "source">[] = [
  { id: "currentTitle", label: "Current title" },
  { id: "styleNumber", label: "SKU / style number" },
  { id: "plusStyleNumber", label: "Plus SKU" },
  { id: "currentDescription", label: "Current description" },
  { id: "matchingStyleReferences", label: "Matching style references" },
  { id: "modelSize", label: "Model size" },
  { id: "modelMeasurements", label: "Model measurements" },
  { id: "colorNames", label: "Color names" },
  { id: "productOptions", label: "Product options" },
  { id: "priceMsrp", label: "Price / MSRP" },
  { id: "existingMetadata", label: "Existing metadata" },
  { id: "productCategory", label: "Product category" },
  { id: "garmentType", label: "Garment type" },
  { id: "searchableProductName", label: "Main searchable product name" },
  { id: "pattern", label: "Pattern" },
  { id: "texture", label: "Texture" },
  { id: "fabricFeel", label: "Fabric feel" },
  { id: "silhouette", label: "Silhouette" },
  { id: "fitImpression", label: "Fit impression" },
  { id: "pockets", label: "Pockets" },
  { id: "closureType", label: "Closure type" },
  { id: "waistbandType", label: "Waistband type" },
  { id: "sleeveType", label: "Sleeve type" },
  { id: "neckline", label: "Neckline" },
  { id: "legShape", label: "Leg shape" },
  { id: "length", label: "Length" },
  { id: "embellishments", label: "Embellishments" },
  { id: "colorFamilies", label: "Color families" },
  { id: "matchingSetRelationships", label: "Matching set relationships" },
  { id: "overallAesthetic", label: "Overall aesthetic" },
  { id: "bestHeroImage", label: "Best hero image" },
  { id: "recommendedImageOrder", label: "Recommended image order" },
];

export function sortedVisibleSchema(schema: FaireSchemaField[]) {
  return [...schema]
    .filter((field) => field.visible)
    .sort((a, b) => a.sortableOrder - b.sortableOrder);
}

export function emptyScore(): FaireSeoScore {
  return {
    titleSeo: 0,
    keywordCoverage: 0,
    retailerClarity: 0,
    metadataQuality: 0,
    boutiquePositioning: 0,
    descriptionStrength: 0,
    imageReadiness: 0,
    plusSizeOptimization: 0,
    overallFaireOptimization: 0,
  };
}
