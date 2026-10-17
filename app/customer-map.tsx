'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Customer } from './crm-types';
import './amap.css';

type Props = { customers: Customer[]; onOpenCustomer: (customer: Customer) => void; embedded?: boolean };
type Coordinate = [number, number];
type AMapMap = {
  addControl(control: object): void;
  destroy(): void;
  setFitView(overlays: AMapMarker[], immediately?: boolean, avoid?: number[], maxZoom?: number): void;
  setZoomAndCenter(zoom: number, center: Coordinate): void;
};
type AMapMarker = { on(event: string, handler: () => void): void; setMap(map: AMapMap | null): void };
type AMapNamespace = {
  Map: new (container: HTMLDivElement, options: Record<string, unknown>) => AMapMap;
  Marker: new (options: Record<string, unknown>) => AMapMarker;
  InfoWindow: new (options: Record<string, unknown>) => { open(map: AMapMap, position: Coordinate): void };
  Pixel: new (x: number, y: number) => object;
  ToolBar: new (options?: Record<string, unknown>) => object;
  Scale: new (options?: Record<string, unknown>) => object;
};

declare global {
  interface Window {
    AMap?: AMapNamespace;
    _AMapSecurityConfig?: { serviceHost: string };
  }
}

let amapLoader: Promise<AMapNamespace> | null = null;

async function loadAMap() {
  if (window.AMap) return window.AMap;
  if (amapLoader) return amapLoader;
  amapLoader = fetch('/api/amap/config', { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || '高德地图配置读取失败');
      }
      return response.json() as Promise<{ key: string; serviceHost: string }>;
    })
    .then(({ key, serviceHost }) => new Promise<AMapNamespace>((resolve, reject) => {
      window._AMapSecurityConfig = { serviceHost };
      const existing = document.querySelector<HTMLScriptElement>('script[data-amap-jsapi]');
      if (existing) {
        existing.addEventListener('load', () => window.AMap ? resolve(window.AMap) : reject(new Error('高德地图加载失败')), { once: true });
        existing.addEventListener('error', () => reject(new Error('高德地图网络加载失败')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.dataset.amapJsapi = 'true';
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.ToolBar,AMap.Scale`;
      script.async = true;
      script.onload = () => window.AMap ? resolve(window.AMap) : reject(new Error('高德地图初始化失败'));
      script.onerror = () => reject(new Error('高德地图网络加载失败'));
      document.head.appendChild(script);
    }));
  return amapLoader;
}

const provinceCenters: Record<string, Coordinate> = {
  北京市:[116.4074,39.9042],上海市:[121.4737,31.2304],天津市:[117.2009,39.0842],重庆市:[106.5516,29.563],河北省:[114.5149,38.0428],山西省:[112.5492,37.857],辽宁省:[123.4315,41.8057],吉林省:[125.3235,43.8171],黑龙江省:[126.6425,45.7567],江苏省:[118.7969,32.0603],浙江省:[120.1551,30.2741],安徽省:[117.2272,31.8206],福建省:[119.2965,26.0745],江西省:[115.8582,28.6829],山东省:[117.1201,36.6512],河南省:[113.6254,34.7466],湖北省:[114.3054,30.5931],湖南省:[112.9388,28.2282],广东省:[113.2644,23.1291],海南省:[110.1983,20.044],四川省:[104.0665,30.5723],贵州省:[106.6302,26.647],云南省:[102.8329,24.8801],陕西省:[108.9398,34.3416],甘肃省:[103.8343,36.0611],青海省:[101.7782,36.6171],内蒙古自治区:[111.7492,40.8426],广西壮族自治区:[108.3669,22.817],西藏自治区:[91.1409,29.6456],宁夏回族自治区:[106.2309,38.4872],新疆维吾尔自治区:[87.6168,43.8256],香港特别行政区:[114.1694,22.3193],澳门特别行政区:[113.5439,22.1987],台湾省:[121.5654,25.033],
};
const cityCenters: Record<string, Coordinate> = {
  北京:[116.4074,39.9042],上海:[121.4737,31.2304],南京:[118.7969,32.0603],南通:[120.8943,31.9802],苏州:[120.5853,31.2989],昆山:[120.9807,31.3856],常州:[119.9741,31.8112],杭州:[120.1551,30.2741],湖州:[120.0868,30.8944],厦门:[118.0894,24.4798],广州:[113.2644,23.1291],深圳:[114.0579,22.5431],东莞:[113.7518,23.0207],佛山:[113.1214,23.0215],清远:[113.056,23.6818],武汉:[114.3054,30.5931],鄂州:[114.8949,30.3911],成都:[104.0665,30.5723],青岛:[120.3826,36.0671],济南:[117.1201,36.6512],曼谷:[100.5018,13.7563],Bangkok:[100.5018,13.7563],
};
const cityHints = Object.keys(cityCenters).filter((city)=>city.length>1).sort((a,b)=>b.length-a.length);
const cleanCity = (city:string) => city.trim().replace(/市$/,'');
export const inferCustomerCity = (customer:Customer) => cleanCity(customer.city) || cityHints.find((city)=>customer.name.includes(city)) || '';
const hash = (text:string) => [...text].reduce((value,char)=>((value*31)+char.charCodeAt(0))>>>0,2166136261);

function locate(customer: Customer) {
  if (Number.isFinite(customer.longitude) && Number.isFinite(customer.latitude)) return { coordinate:[Number(customer.longitude),Number(customer.latitude)] as Coordinate, precision:'exact', city:inferCustomerCity(customer) };
  const city = inferCustomerCity(customer); const center = cityCenters[city] || provinceCenters[customer.province];
  if (!center) return null;
  const seed = hash(customer.name); const angle = (seed % 360) * Math.PI / 180; const radius = cityCenters[city] ? .035 + (seed % 35) / 1000 : .18 + (seed % 45) / 100;
  return { coordinate:[center[0]+Math.cos(angle)*radius,center[1]+Math.sin(angle)*radius] as Coordinate, precision:city?'city':'province', city };
}

export default function CustomerMap({ customers, onOpenCustomer, embedded=false }: Props) {
  const containerRef=useRef<HTMLDivElement>(null); const mapRef=useRef<AMapMap|null>(null); const markersRef=useRef<AMapMarker[]>([]); const amapRef=useRef<AMapNamespace|null>(null);
  const [ready,setReady]=useState(false); const [mapError,setMapError]=useState(''); const [province,setProvince]=useState('全部省份'); const [level,setLevel]=useState('全部级别'); const [query,setQuery]=useState('');
  const mapped=useMemo(()=>customers.map((customer)=>({customer,location:locate(customer)})).filter((item):item is {customer:Customer;location:NonNullable<ReturnType<typeof locate>>}=>Boolean(item.location)),[customers]);
  const visible=useMemo(()=>mapped.filter(({customer})=>(province==='全部省份'||customer.province===province)&&(level==='全部级别'||customer.customerLevel===level)&&(!query||customer.name.toLowerCase().includes(query.toLowerCase()))),[mapped,province,level,query]);
  const exact=mapped.filter((item)=>item.location.precision==='exact').length; const cities=new Set(mapped.map((item)=>item.location.city).filter(Boolean)).size;

  useEffect(()=>{
    let cancelled=false;
    if(!containerRef.current||mapRef.current)return;
    void loadAMap().then((AMap)=>{
      if(cancelled||!containerRef.current)return;
      amapRef.current=AMap;
      const map=new AMap.Map(containerRef.current,{center:[105,35],zoom:3,minZoom:2,maxZoom:18,viewMode:'2D',mapStyle:'amap://styles/whitesmoke'});
      map.addControl(new AMap.ToolBar({position:{top:'14px',right:'14px'}}));
      map.addControl(new AMap.Scale());
      mapRef.current=map;setReady(true);
    }).catch((error)=>{if(!cancelled)setMapError(error instanceof Error?error.message:'高德地图加载失败')});
    return()=>{cancelled=true;markersRef.current.forEach((marker)=>marker.setMap(null));markersRef.current=[];mapRef.current?.destroy();mapRef.current=null;amapRef.current=null};
  },[]);
  useEffect(()=>{
    const map=mapRef.current;const AMap=amapRef.current;if(!map||!AMap||!ready)return;
    markersRef.current.forEach((marker)=>marker.setMap(null));markersRef.current=[];
    for(const {customer,location} of visible){
      const element=document.createElement('button');element.className=`customer-marker marker-${customer.customerLevel}`;element.type='button';element.title=customer.name;element.setAttribute('aria-label',`查看 ${customer.name}`);
      const card=document.createElement('div');card.className='map-popup';
      const name=document.createElement('strong');name.textContent=customer.name;card.append(name);
      const place=document.createElement('span');place.textContent=[customer.province,location.city,customer.address].filter(Boolean).join(' · ')||'位置待补充';card.append(place);
      const status=document.createElement('small');status.textContent=location.precision==='exact'?'精确坐标':location.precision==='city'?'城市约略位置':'省级约略位置';card.append(status);
      const action=document.createElement('button');action.type='button';action.textContent='打开客户资料 →';action.addEventListener('click',()=>onOpenCustomer(customer));card.append(action);
      const infoWindow=new AMap.InfoWindow({content:card,offset:new AMap.Pixel(0,-24),isCustom:true});
      const marker=new AMap.Marker({map,position:location.coordinate,content:element,anchor:'bottom-center',title:customer.name,zIndex:customer.customerLevel==='大客户'?120:100});
      marker.on('click',()=>infoWindow.open(map,location.coordinate));markersRef.current.push(marker);
    }
    if(visible.length===1)map.setZoomAndCenter(11,visible[0].location.coordinate);else if(visible.length>1)map.setFitView(markersRef.current,false,[55,55,55,55],9);
  },[visible,ready,onOpenCustomer]);

  const mapCanvas=<div className="map-canvas"><div ref={containerRef} className={`customer-map${embedded?' visit-map':''}`} aria-label={embedded?'当前城市客户高德地图':'客户高德地图'}/>{mapError&&<div className="map-config-state"><strong>高德地图待配置</strong><span>{mapError}</span><small>请配置 AMAP_JS_KEY 和 AMAP_SECURITY_JS_CODE。</small></div>}{!ready&&!mapError&&<div className="map-config-state"><span>正在加载高德地图…</span></div>}</div>;
  if(embedded)return mapCanvas;
  return <section className="workspace map-workspace"><div className="section-heading"><div><p className="eyebrow">AMAP CUSTOMER MAP</p><h2>客户位置分布</h2><p className="section-note">高德地图支持拖动、缩放和点击客户标记；约略位置会明确标注。</p></div><div className="filters"><label className="search"><span>⌕</span><input placeholder="搜索地图客户…" value={query} onChange={(event)=>setQuery(event.target.value)}/></label><select value={province} onChange={(event)=>setProvince(event.target.value)}><option>全部省份</option>{[...new Set(customers.map((customer)=>customer.province))].sort().map((value)=><option key={value}>{value}</option>)}</select><select value={level} onChange={(event)=>setLevel(event.target.value)}><option>全部级别</option><option>大客户</option><option>重点客户</option><option>一般客户</option></select></div></div>
    <div className="map-stats"><span><strong>{visible.length}</strong> 个可见客户标记</span><span><strong>{cities}</strong> 个城市</span><span><strong>{exact}</strong> 个精确坐标</span><span className="map-legend"><i className="pin large"/>大客户<i className="pin key"/>重点客户<i className="pin regular"/>一般客户</span></div>
    <div className="map-layout">{mapCanvas}<aside className="map-list"><h3>地图客户</h3>{visible.slice(0,30).map(({customer,location})=><button key={customer.id} onClick={()=>onOpenCustomer(customer)}><i className={`pin ${customer.customerLevel==='大客户'?'large':customer.customerLevel==='重点客户'?'key':'regular'}`}/><span><strong>{customer.name}</strong><small>{[customer.province,location.city].filter(Boolean).join(' · ')} · {location.precision==='exact'?'精确':'约略'}</small></span></button>)}{!visible.length&&<p className="muted">当前筛选条件下没有可定位客户。</p>}</aside></div>
    {customers.length-mapped.length>0&&<p className="map-note">另有 {customers.length-mapped.length} 家客户缺少省市或坐标，暂未显示在地图上。</p>}
  </section>;
}
