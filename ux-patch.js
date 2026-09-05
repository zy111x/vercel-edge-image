// Keep the editor flow frictionless: when users leave an effect panel,
// commit a valid live-preview draft before the tool switch happens.
document.addEventListener('click',(event)=>{
  const toolButton=event.target.closest?.('.tool-button');
  if(!toolButton)return;
  const applyButton=document.querySelector('#toolPanel [data-action="apply"]');
  if(applyButton&&!applyButton.disabled)applyButton.click();
},true);
