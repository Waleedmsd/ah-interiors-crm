'use client';
import LegacyPurchasingPage from '@/components/legacy-purchasing-page';
import {PurchasingWorkspace} from '@/components/purchasing-workspace';
export default function PurchasingPage(){return process.env.NEXT_PUBLIC_CRM_MODE==='preview'&&process.env.NODE_ENV!=='production'?<LegacyPurchasingPage/>:<PurchasingWorkspace/>;}
