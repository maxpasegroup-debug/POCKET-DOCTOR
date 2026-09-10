import { button, confirmAction, el, failure, loading, notice } from './dom.ts';
import { StaleRequest } from './api.ts';
import type { PageContext } from './pages.ts';
interface Application {
  status:string; phone:string; rejectionReason:string|null; submittedAt:string|null;
  profile:Record<string,unknown>; documents:{id:string;kind:string;fileName:string;size:number}[];
  documentPolicy:{configured:boolean;storageAvailable:boolean;requiredKinds:string[]};
}
export function registrationReview(id:string,context:PageContext) {
  const root=el('section','detail-section',el('h2','','Registration application')),body=el('div');root.append(body);
  const base=`/admin/operations/doctors/${encodeURIComponent(id)}/registration`;
  async function refresh(){
    body.replaceChildren(loading());
    try {
      const app=await context.api.request<Application>(base);if(!context.alive())return;
      body.replaceChildren(el('p','',`Status: ${app.status}`),el('p','',`Verified mobile: ${app.phone}`));
      if(app.submittedAt)body.append(el('p','',`Submitted: ${app.submittedAt}`));
      if(app.rejectionReason)body.append(notice(app.rejectionReason,true));
      const details=el('dl','facts');for(const [key,value] of Object.entries(app.profile))details.append(el('div','',el('dt','',key),el('dd','',Array.isArray(value)?value.join(', '):String(value??''))));body.append(details);
      if(!app.documentPolicy.storageAvailable||!app.documentPolicy.configured)body.append(notice('Secure storage and an approved document policy are required before submission or approval.',true));
      if(!app.documents.length)body.append(el('p','','No credentials submitted.'));
      for(const doc of app.documents){
        const row=el('div','inline-action',el('span','',`${doc.kind}: ${doc.fileName} (${doc.size} bytes)`));
        const download=button('Download privately',async()=>{
          download.disabled=true;
          try{const data=await context.api.request<{fileName:string;contentType:string;contentBase64:string}>(`${base}/documents/${encodeURIComponent(doc.id)}`);if(!context.alive())return;
            const bytes=Uint8Array.from(atob(data.contentBase64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:data.contentType}));
            const link=el('a');link.href=url;link.download=data.fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
          }catch(error){if(context.alive()&&!(error instanceof StaleRequest))row.append(notice((error as Error).message,true));}finally{download.disabled=false;}
        });row.append(download);body.append(row);
      }
      const reason=el('textarea');reason.maxLength=2000;reason.setAttribute('aria-label','Correction reason');reason.placeholder='Explain what the doctor needs to correct';
      if(['SUBMITTED','UNDER_REVIEW'].includes(app.status))body.append(reason);
      const actions=app.status==='VERIFIED'?['SUSPEND']:['SUBMITTED','UNDER_REVIEW'].includes(app.status)?['BEGIN_REVIEW','APPROVE','REJECT']:[];
      for(const action of actions){const b=button(({BEGIN_REVIEW:'Begin review',APPROVE:'Approve application',REJECT:'Request corrections',SUSPEND:'Suspend doctor'} as Record<string,string>)[action]!,async()=>{
        if(action==='REJECT'&&!reason.value.trim()){body.append(notice('A correction reason is required.',true));return;}
        if(!await confirmAction('Review doctor application',`${action.replaceAll('_',' ')} this application? Only verified doctors receive operational access.`)||!context.alive())return;
        b.disabled=true;
        try{await context.api.request(base+'/review','POST',{action,reason:action==='REJECT'?reason.value.trim():''});if(context.alive())context.reload();}
        catch(error){if(context.alive()&&!(error instanceof StaleRequest))body.append(notice((error as Error).message,true));}finally{b.disabled=false;}
      });if(action==='APPROVE'&&(!app.documentPolicy.configured||!app.documentPolicy.storageAvailable))b.disabled=true;body.append(b);}
    }catch(error){if(context.alive()&&!(error instanceof StaleRequest))body.replaceChildren(failure(error,()=>void refresh()));}
  }
  void refresh();return root;
}
