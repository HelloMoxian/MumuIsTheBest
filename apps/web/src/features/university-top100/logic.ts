export type UniversitySubject = {
  code: string;
  name: string;
};

export type UniversityCategory = {
  code: string;
  name: string;
  subjects: UniversitySubject[];
};

export type UniversityRecord = {
  code: string;
  name: string;
  region: string;
  logoUrl: string;
  profileUrl: string;
};

export type CountryRecord = {
  name: string;
  iso2: string;
  iconUrl: string;
};

export type RankingEntry = {
  ranking: string;
  rankStart: number;
  universityCode: string;
  score: number | null;
  indicators: Array<number | null>;
};

export type UniversityRankingData = {
  schemaVersion: 1;
  year: number;
  retrievedAt: string;
  source: {
    name: string;
    url: string;
    note: string;
  };
  indicators: Array<{ code: string; name: string }>;
  categories: UniversityCategory[];
  countries: CountryRecord[];
  universities: UniversityRecord[];
  rankings: Record<string, RankingEntry[]>;
};

export type RankingViewRow = RankingEntry & {
  university: UniversityRecord;
  country?: CountryRecord;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasString(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" && value[key].length > 0;
}

export function parseUniversityRankingData(value: unknown): UniversityRankingData {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("大学榜单数据版本不兼容。");
  }
  if (
    typeof value.year !== "number"
    || !hasString(value, "retrievedAt")
    || !isRecord(value.source)
    || !Array.isArray(value.indicators)
    || !Array.isArray(value.categories)
    || !Array.isArray(value.countries)
    || !Array.isArray(value.universities)
    || !isRecord(value.rankings)
  ) {
    throw new Error("大学榜单数据缺少必要字段。");
  }
  if (!hasString(value.source, "name") || !hasString(value.source, "url")) {
    throw new Error("大学榜单缺少来源信息。");
  }
  if (value.categories.length === 0) {
    throw new Error("大学榜单暂时没有专业分类。");
  }

  for (const category of value.categories) {
    if (
      !isRecord(category)
      || !hasString(category, "code")
      || !hasString(category, "name")
      || !Array.isArray(category.subjects)
      || category.subjects.length === 0
    ) {
      throw new Error("大学榜单包含无效的专业分类。");
    }
  }

  return value as UniversityRankingData;
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

export function filterRankingRows(
  data: UniversityRankingData,
  subjectCode: string,
  query: string,
  region: string,
): RankingViewRow[] {
  const universityByCode = new Map(
    data.universities.map((university) => [university.code, university]),
  );
  const countryByName = new Map(data.countries.map((country) => [country.name, country]));
  const search = normalized(query);

  return (data.rankings[subjectCode] ?? []).flatMap((entry) => {
    const university = universityByCode.get(entry.universityCode);
    if (!university) return [];
    if (region !== "全部" && university.region !== region) return [];
    const searchText = normalized(`${university.name} ${university.region}`);
    if (search && !searchText.includes(search)) return [];
    return [{ ...entry, university, country: countryByName.get(university.region) }];
  });
}

export function regionsForSubject(data: UniversityRankingData, subjectCode: string) {
  const universityByCode = new Map(
    data.universities.map((university) => [university.code, university]),
  );
  return [...new Set(
    (data.rankings[subjectCode] ?? [])
      .map((entry) => universityByCode.get(entry.universityCode)?.region)
      .filter((region): region is string => Boolean(region)),
  )].sort((left, right) => left.localeCompare(right, "zh-CN"));
}
