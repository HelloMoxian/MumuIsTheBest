import { COUNTRY_NOTES, COUNTRY_SNAPSHOT, countryEconomy, formatCountryNumber, type CountryCity, type CountryProfile } from "./countries";

export function CountryCard({ profile, onFocus, onCity }: { profile: CountryProfile; onFocus: () => void; onCity: (city: CountryCity) => void }) {
  const note = COUNTRY_NOTES[profile.code];
  const seat = profile.cities.filter(city => city.capital || city.role.includes("驻地") || city.role === "行政中心");
  return <section className="geo-country-card" aria-label={profile.name + (profile.independent ? "国家资料" : "地区资料")}>
    <header className="geo-country-heading">
      {profile.flag && <svg className="geo-country-flag" viewBox="0 0 640 480" role="img" aria-label={["CN", "HK", "MO", "TW"].includes(profile.code) ? "中华人民共和国国旗" : profile.name + (profile.independent ? "国旗" : "旗帜")}><use href={"/images/nature/geography/flags.v1.svg#" + profile.flag} /></svg>}
      <h2>{profile.name}</h2>
    </header>
    <div className="geo-country-stats">
      <div><span>人口{profile.population?.year && " · " + profile.population.year}</span><strong title={profile.population ? profile.population.value.toLocaleString("zh-CN") + " 人" : undefined}>{profile.population ? formatCountryNumber(profile.population.value, "") : "资料暂缺"}</strong>{profile.population && <span>人</span>}</div>
      <div><span>面积{profile.area?.year && " · " + profile.area.year}</span><strong title={profile.area ? profile.area.value.toLocaleString("zh-CN") + " 平方千米" : undefined}>{profile.area ? formatCountryNumber(profile.area.value, "") : "资料暂缺"}</strong>{profile.area && <span>平方千米</span>}</div>
    </div>
    {seat.length > 0 && <p className="geo-country-capital">{seat.map(city => city.role + "：" + city.name).join("；")}</p>}
    <dl className="geo-country-stories">
      <div><dt>认识这里</dt><dd>{profile.overview}</dd></div>
      <div><dt>人文风情</dt><dd>{note?.culture || (profile.heritage.length ? "可以从" + profile.heritage.map(site => "「" + site.name + "」").join("、") + "等世界遗产认识当地的历史与风景。" : profile.languages.length ? "语言是认识当地生活的一扇窗。" : "人文资料暂缺。")}
        {profile.languages.length > 0 && <span className="geo-country-language">语言：{profile.languages.slice(0, 3).join("、")}{profile.languages.length > 3 ? "等" : ""}。</span>}</dd></div>
      <div><dt>经济生活</dt><dd>{countryEconomy(profile)}</dd></div>
    </dl>
    <button className="geo-wide" onClick={onFocus}>放大看看</button>
    <details className="geo-country-cities" open><summary>{profile.independent ? "首都与主要城市" : "行政中心与主要城市"} · {profile.cities.length}</summary>
      {profile.cities.length ? <div>{profile.cities.map(city => <button key={city.id} onClick={() => onCity(city)} aria-label={"定位" + city.role + "：" + city.name}><span aria-hidden="true">{city.capital ? "★" : "●"}</span> {city.name}<small>{city.role}</small></button>)}</div> : <p>暂未收录主要城市。</p>}
    </details>
    <details className="geo-country-sources"><summary>资料年份与来源</summary>
      <p>人口：{profile.population ? profile.population.source + " · " + profile.population.year : "暂缺"}{profile.populationNote ? "；" + profile.populationNote : ""}。面积：{profile.area ? profile.area.source + (profile.area.year ? " · " + profile.area.year : "，来源未标年份") : "暂缺"}{profile.area?.note ? "；" + profile.area.note : "；包含陆地与内陆水域，范围依来源口径"}。</p>
      <p>城市为 Natural Earth 5.1.2 精选位置；并非实时人口排名。资料整理于 {COUNTRY_SNAPSHOT}。</p>
      <div className="geo-source-links">
        <a href="https://data.worldbank.org/indicator/SP.POP.TOTL" target="_blank" rel="noreferrer">世界银行 · 人口与经济</a>
        <a href="https://data.worldbank.org/indicator/AG.SRF.TOTL.K2" target="_blank" rel="noreferrer">世界银行 · 总面积口径</a>
        {profile.code === "CN" && <a href="https://www.gov.cn/guoqing/" target="_blank" rel="noreferrer">中国政府网 · 国情</a>}
        {profile.heritage.map(site => <a key={site.url} href={site.url} target="_blank" rel="noreferrer">世界遗产 · {site.name}</a>)}
        {note?.sources.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">介绍与地名来源 {index + 1}</a>)}
      </div>
    </details>
  </section>;
}
