export type Customer = {
  id: number;
  name: string;
  province: string;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  locationPrecision: 'exact' | 'city' | 'province';
  salesperson: string;
  ownerUserId: number | null;
  ownerName: string | null;
  orderCount: number;
  latestOrderDate: string;
  latestOrderNo: string;
  customerLevel: string;
  communicationCycle: string;
  communicated: boolean | number;
  lastCommunicationAt: string | null;
  communicationSummary: string;
  contactName: string;
  contactPhone: string;
  tags: string;
};

export type CustomerImportRow = Pick<Customer, 'name' | 'province' | 'city' | 'address' | 'latitude' | 'longitude' | 'customerLevel' | 'salesperson' | 'contactName' | 'contactPhone' | 'tags'>;

export type CustomerVisit = { id:number; customerId:number; plannedAt:string; status:string; purpose:string; summary:string; createdAt:string; updatedAt:string };

export type NetworkContact = {
  id: number;
  sequence: number;
  name: string;
  importance: string;
  frequency: string;
  category: string;
  organization: string;
  industry: string;
  notes: string;
  initialContact: string;
  contacted: boolean | number;
  lastContactAt: string | null;
  contactSummary: string;
  createdAt: string;
  updatedAt: string;
};

export type NetworkInteraction = { id:number; contactId:number; contactedAt:string; summary:string };
