// ─── Name Card ───────────────────────────────────────────

export const sampleNamecard = {
  id: "nc-001",
  user_id: "user-001",
  last_name: "田中",
  first_name: "太郎",
  last_name_kana: "タナカ",
  first_name_kana: "タロウ",
  company_name: "株式会社テスト",
  department: "営業部",
  position: "部長",
  image_front_url: "/images/card-front.jpg",
  image_back_url: "/images/card-back.jpg",
  memo: "重要な取引先",
  contact_methods: [
    { type: "email" as const, value: "tanaka@example.com", is_primary: true },
    { type: "mobile" as const, value: "090-1234-5678", is_primary: false },
    {
      type: "address" as const,
      value: "東京都千代田区丸の内1-1-1",
      is_primary: false,
    },
  ],
  tags: [
    { id: "1", name: "取引先" },
    { id: "2", name: "ゴルフ仲間" },
  ],
  relationships: [
    {
      id: "1",
      name: "建築士会",
      parent_id: null,
      full_path: "建築士会",
    },
  ],
  images: [
    {
      id: 1,
      image_path: "sample/front.webp",
      position: 0,
      created_at: "2026-01-15T09:00:00Z",
    },
  ],
  created_at: "2026-01-15T09:00:00Z",
  updated_at: "2026-02-20T14:30:00Z",
};

export const sampleNamecardMinimal = {
  id: "nc-002",
  user_id: "user-001",
  last_name: "佐藤",
  first_name: "花子",
  last_name_kana: "",
  first_name_kana: "",
  company_name: "",
  department: "",
  position: "",
  image_front_url: null,
  image_back_url: null,
  memo: "",
  contact_methods: [],
  tags: [],
  relationships: [],
  images: [],
  created_at: "2026-02-01T10:00:00Z",
  updated_at: "2026-02-01T10:00:00Z",
};

// ─── Relationship Tree ───────────────────────────────────

export const sampleRelationshipTree = [
  {
    id: "rel-001",
    name: "建築士会",
    parent_id: null,
    children: [
      {
        id: "rel-002",
        name: "桑名支部",
        parent_id: "rel-001",
        children: [
          {
            id: "rel-003",
            name: "青年会長",
            parent_id: "rel-002",
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: "rel-010",
    name: "ゴルフ仲間",
    parent_id: null,
    children: [],
  },
];

export const sampleFlatRelationships = [
  { id: "rel-001", name: "建築士会", parent_id: null },
  { id: "rel-002", name: "桑名支部", parent_id: "rel-001" },
  { id: "rel-003", name: "青年会長", parent_id: "rel-002" },
  { id: "rel-010", name: "ゴルフ仲間", parent_id: null },
];

// ─── Tags ────────────────────────────────────────────────

export const sampleTags = [
  { id: "tag-001", name: "取引先" },
  { id: "tag-002", name: "友人" },
  { id: "tag-003", name: "ゴルフ仲間" },
];

// ─── Auth ────────────────────────────────────────────────

export const sampleUser = {
  id: 1,
  email: "test@example.com",
  created_at: "2026-01-01T00:00:00Z",
};

export const sampleAuthTokens = {
  access_token: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.mock-access-token",
  refresh_token: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.mock-refresh-token",
  token_type: "bearer",
};

// ─── API Responses ───────────────────────────────────────

export const samplePaginatedResponse = <T>(
  items: T[],
  total = items.length,
) => ({
  items,
  total,
  page: 1,
  per_page: 20,
  total_pages: Math.ceil(total / 20),
});

export const sampleErrorResponse = (
  message = "エラーが発生しました",
  status = 400,
) => ({
  detail: message,
  status_code: status,
});
