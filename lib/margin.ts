export type VariableCosts={inboundFreightPence:number;deliveryPence:number;assemblyPence:number;paymentFeePence:number;financeFeePence:number;marketplaceFeePence:number;marketingPence:number;otherPence:number};
export type MarginThresholds={excellent:number;strong:number;acceptable:number};
export type MarginInput={revenuePence:number;supplierCostPence:number;discountPence:number;vatBps:number;vatTreatment:'Standard'|'Zero rated'|'Exempt';costs:VariableCosts};
export const emptyCosts:VariableCosts={inboundFreightPence:0,deliveryPence:0,assemblyPence:0,paymentFeePence:0,financeFeePence:0,marketplaceFeePence:0,marketingPence:0,otherPence:0};
export function calculateMargin(input:MarginInput,thresholds:MarginThresholds){
 const values=[input.revenuePence,input.supplierCostPence,input.discountPence,input.vatBps,...Object.values(input.costs),...Object.values(thresholds)];
 if(values.some(v=>!Number.isSafeInteger(v)||v<0)||input.discountPence>input.revenuePence||input.vatBps>10000||!(thresholds.excellent>=thresholds.strong&&thresholds.strong>=thresholds.acceptable))throw new Error('Invalid profitability inputs.');
 const netPaid=input.revenuePence-input.discountPence;
 const revenueExVatPence=input.vatTreatment==='Standard'?Math.round(netPaid*10000/(10000+input.vatBps)):netPaid;
 const vatPence=netPaid-revenueExVatPence;
 const grossProfitPence=revenueExVatPence-input.supplierCostPence-input.costs.inboundFreightPence;
 const contributionProfitPence=grossProfitPence-Object.entries(input.costs).filter(([key])=>key!=='inboundFreightPence').reduce((sum,[,v])=>sum+v,0);
 const grossMarginBps=revenueExVatPence?Math.floor(grossProfitPence*10000/revenueExVatPence):0;
 const contributionMarginBps=revenueExVatPence?Math.floor(contributionProfitPence*10000/revenueExVatPence):0;
 const tier=contributionMarginBps>=thresholds.excellent?'Excellent':contributionMarginBps>=thresholds.strong?'Strong':contributionMarginBps>=thresholds.acceptable?'Acceptable':'Approval Required';
 return {revenueExVatPence,vatPence,grossProfitPence,grossMarginBps,contributionProfitPence,contributionMarginBps,tier,approvalRequired:tier==='Approval Required'};
}
