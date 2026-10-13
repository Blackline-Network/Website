const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { loadDatabase, saveDatabase, findDynasty } = require('../utils/league');
const STORE = path.join(__dirname, '..', 'data', 'disputes.json');
const PANEL_TITLE = '🗃️ BLACKLINE · Dispute Center';
function makePanel() {
 const panel=new EmbedBuilder().setColor(0x5865F2).setTitle(PANEL_TITLE).setDescription('Submit a game dispute, report a disconnect, or request an approved restart. Include clear screenshot evidence so commissioners can review the case.\n\n**How it works**\n1. Click **Submit a Dispute** below.\n2. Complete the form and include a screenshot link.\n3. Commissioners review the case and record a ruling.\n4. Decisions remain in the dispute history.').addFields({name:'Available case types',value:'🏈 Game Result · 🔌 Disconnect · 🔄 Restart Request · 📋 Other',inline:false},{name:'Review process',value:'Commissioners can record a force win, disconnect, approve a restart, or deny the case.',inline:false}).setFooter({text:'BLACKLINE · Disputes and rulings are logged'});
 const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('blackline_dispute_panel_submit').setLabel('Submit a Dispute').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('blackline_dispute_panel_history').setLabel('Recent Decisions').setStyle(ButtonStyle.Secondary));
 return {embeds:[panel],components:[row]};
}
async function syncPanel(client, guild) {
 const channel=guild.channels.cache.find(c=>c.name==='🗃️・support'&&c.isTextBased()); if(!channel) return false;
 try { const messages=await channel.messages.fetch({limit:100}); const existing=messages.find(m=>m.author.id===client.user.id&&m.embeds.some(e=>e.title===PANEL_TITLE)); if(existing) await existing.edit(makePanel()); else await channel.send(makePanel()); return true; } catch(error) { console.error(`Could not sync dispute panel in ${guild.name}:`,error); return false; }
}
const MANAGER_ROLES = [...(process.env.DYNASTY_MANAGER_ROLES || 'Commissioner,Dynasty Manager,League Manager').split(',').map(s=>s.trim()), ...(process.env.BL_STAFF_ROLES || 'BL Staff').split(',').map(s=>s.trim())];
function loadCases(){ try { const v=JSON.parse(fs.readFileSync(STORE,'utf8')); return Array.isArray(v)?v:[]; } catch { return []; } }
function saveCases(v){ fs.mkdirSync(path.dirname(STORE),{recursive:true}); fs.writeFileSync(STORE,JSON.stringify(v,null,2)); }
function manager(i){ return !!i.memberPermissions?.has(PermissionFlagsBits.Administrator) || !!i.member?.roles?.cache?.some(r=>MANAGER_ROLES.includes(r.name)||MANAGER_ROLES.includes(r.id)); }
function embedCase(c){ const e=new EmbedBuilder().setColor(c.status==='Pending'?0xE5AE43:c.status==='Approved'?0x35B779:0xD9534F).setTitle(`🗂️ Dispute #${c.id} · ${c.type}`).setDescription(c.description).addFields({name:'Dynasty',value:c.dynasty,inline:true},{name:'Submitted by',value:`<@${c.userId}>`,inline:true},{name:'Status',value:c.status,inline:true},{name:'Evidence',value:c.attachmentUrl||'No screenshot attached',inline:false}); if(c.decision)e.addFields({name:'Ruling',value:`**${c.decision}** by <@${c.decidedBy}>\n${c.decisionNote||'No note provided.'}`}); e.setFooter({text:`BLACKLINE Dispute Log · Case ${c.id}`}).setTimestamp(new Date(c.createdAt)); return e; }
function buttons(c){ if(c.status!=='Pending')return []; return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`blackline_dispute_${c.id}_forcewin`).setLabel('Force Win').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`blackline_dispute_${c.id}_disconnect`).setLabel('Record Disconnect').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(`blackline_dispute_${c.id}_restart`).setLabel('Approve Restart').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(`blackline_dispute_${c.id}_deny`).setLabel('Deny').setStyle(ButtonStyle.Danger))]; }
module.exports={
 syncPanel,
 data:new SlashCommandBuilder().setName('dispute').setDescription('Submit or review league disputes.')
 .addSubcommand(s=>s.setName('submit').setDescription('Submit a dispute with screenshot evidence.')
  .addStringOption(o=>o.setName('dynasty').setDescription('Exact dynasty name').setRequired(true))
  .addStringOption(o=>o.setName('type').setDescription('Dispute type').setRequired(true).addChoices({name:'Game Result',value:'Game Result'},{name:'Disconnect',value:'Disconnect'},{name:'Restart Request',value:'Restart Request'},{name:'Other',value:'Other'}))
  .addStringOption(o=>o.setName('details').setDescription('Explain what happened').setRequired(true).setMaxLength(1000))
  .addAttachmentOption(o=>o.setName('screenshot').setDescription('Screenshot evidence').setRequired(true)))
 .addSubcommand(s=>s.setName('history').setDescription('View recent dispute decisions.').addStringOption(o=>o.setName('dynasty').setDescription('Filter by dynasty').setRequired(false)))
 .addSubcommand(s=>s.setName('panel').setDescription('Post or refresh the dispute panel in 🗃️・support.')),
 async execute(i){
  const db=loadDatabase(), sub=i.options.getSubcommand();
  if(sub==='panel'){
   if(!manager(i)) return i.reply({content:'Only commissioners / configured dynasty managers can publish the support panel.',ephemeral:true});
   const channel=i.guild?.channels.cache.find(c=>c.name==='🗃️・support'&&c.isTextBased());
   if(!channel) return i.reply({content:'I could not find the 🗃️・support text channel.',ephemeral:true});
   const messages=await channel.messages.fetch({limit:100});
   const existing=messages.find(m=>m.author.id===i.client.user.id&&m.embeds.some(e=>e.title===PANEL_TITLE));
   const posted=existing?await existing.edit(makePanel()):await channel.send(makePanel());
   return i.reply({content:`✅ Dispute panel updated in ${channel}: ${posted.url}`,ephemeral:true});
  }
  if(sub==='submit'){
   const name=i.options.getString('dynasty').trim(), d=findDynasty(db,name), attachment=i.options.getAttachment('screenshot');
   if(!d||d.status!=='active')return i.reply({content:`Could not find active dynasty **${name}**.`,ephemeral:true});
   if(!(d.coaches||[]).some(c=>c.userId===i.user.id)&&!manager(i))return i.reply({content:'Only a registered coach in this dynasty can submit a dispute.',ephemeral:true});
   if(!i.guild)return i.reply({content:'Submit disputes from your server.',ephemeral:true});
   const channel=i.guild.channels.cache.find(c=>c.name==='🗃️・support'&&c.isTextBased());
   if(!channel)return i.reply({content:'I could not find the 🗃️・support text channel. Please create it and try again.',ephemeral:true});
   const cases=loadCases(), c={id:String(Date.now()),guildId:i.guildId,dynasty:name,userId:i.user.id,type:i.options.getString('type'),description:i.options.getString('details'),attachmentUrl:attachment.url,status:'Pending',createdAt:new Date().toISOString(),decidedBy:null,decision:null,decisionNote:''};
   cases.push(c); saveCases(cases);
   const msg=await channel.send({embeds:[embedCase(c)],components:buttons(c),allowedMentions:{parse:[]}}); c.messageId=msg.id;c.channelId=channel.id;saveCases(cases);
   return i.reply({content:`✅ Dispute **#${c.id}** submitted to ${channel}. Commissioners have been alerted there.`,ephemeral:true});
  }
  const filter=i.options.getString('dynasty'); const all=loadCases().filter(c=>c.guildId===i.guildId&&(!filter||c.dynasty.toLowerCase()===filter.toLowerCase())).slice(-10).reverse();
  if(!all.length)return i.reply({content:'No disputes found for that filter.',ephemeral:true});
  const e=new EmbedBuilder().setColor(0x5865F2).setTitle('🗂️ Recent Dispute History').setDescription(all.map(c=>`**#${c.id} · ${c.dynasty} · ${c.type}** — ${c.status}\nSubmitted by <@${c.userId}>${c.decision?` · Ruling: **${c.decision}**`:''}`).join('\n\n').slice(0,4000));
  return i.reply({embeds:[e],ephemeral:true});
 },
 async handleModal(i){
  const name=i.fields.getTextInputValue('dynasty').trim(), typeInput=i.fields.getTextInputValue('type').trim().toLowerCase(), details=i.fields.getTextInputValue('details').trim(), screenshot=i.fields.getTextInputValue('screenshot').trim();
  const types={'game result':'Game Result','disconnect':'Disconnect','restart request':'Restart Request','other':'Other'};
  const type=types[typeInput];
  if(!type)return i.reply({content:'Case type must be Game Result, Disconnect, Restart Request, or Other. Please submit again.',ephemeral:true});
  let parsed; try { parsed=new URL(screenshot); } catch { return i.reply({content:'Please provide a valid screenshot image URL.',ephemeral:true}); }
  if(!['https:'].includes(parsed.protocol))return i.reply({content:'Screenshot URL must use HTTPS.',ephemeral:true});
  const db=loadDatabase(),d=findDynasty(db,name);
  if(!d||d.status!=='active')return i.reply({content:`Could not find active dynasty **${name}**.`,ephemeral:true});
  if(!(d.coaches||[]).some(c=>c.userId===i.user.id)&&!manager(i))return i.reply({content:'Only a registered coach in this dynasty can submit a dispute.',ephemeral:true});
  const channel=i.guild?.channels.cache.find(c=>c.name==='🗃️・support'&&c.isTextBased());
  if(!channel)return i.reply({content:'I could not find the 🗃️・support text channel.',ephemeral:true});
  const cases=loadCases(),c={id:String(Date.now()),guildId:i.guildId,dynasty:name,userId:i.user.id,type,description:details,attachmentUrl:screenshot,status:'Pending',createdAt:new Date().toISOString(),decidedBy:null,decision:null,decisionNote:''};
  cases.push(c);saveCases(cases);
  const msg=await channel.send({embeds:[embedCase(c)],components:buttons(c),allowedMentions:{parse:[]}});c.messageId=msg.id;c.channelId=channel.id;saveCases(cases);
  return i.reply({content:`✅ Dispute **#${c.id}** submitted to ${channel}. Commissioners can review it there.`,ephemeral:true});
 },
 async handleButton(i){
  if(i.customId==='blackline_dispute_panel_submit') {
   const modal=new ModalBuilder().setCustomId('blackline_dispute_submit_modal').setTitle('Submit a Dispute');
   const dynasty=new TextInputBuilder().setCustomId('dynasty').setLabel('Exact dynasty name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100);
   const type=new TextInputBuilder().setCustomId('type').setLabel('Case type').setPlaceholder('Game Result, Disconnect, Restart Request, or Other').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40);
   const details=new TextInputBuilder().setCustomId('details').setLabel('What happened?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
   const screenshot=new TextInputBuilder().setCustomId('screenshot').setLabel('Screenshot image URL (required)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500);
   modal.addComponents(new ActionRowBuilder().addComponents(dynasty),new ActionRowBuilder().addComponents(type),new ActionRowBuilder().addComponents(details),new ActionRowBuilder().addComponents(screenshot));
   return i.showModal(modal);
  }
  if(i.customId==='blackline_dispute_panel_history'){
   const all=loadCases().filter(c=>c.guildId===i.guildId).slice(-10).reverse();
   if(!all.length)return i.reply({content:'No disputes have been submitted yet.',ephemeral:true});
   const e=new EmbedBuilder().setColor(0x5865F2).setTitle('🗂️ Recent Dispute History').setDescription(all.map(c=>`**#${c.id} · ${c.dynasty} · ${c.type}** — ${c.status}\nSubmitted by <@${c.userId}>${c.decision?` · Ruling: **${c.decision}**`:''}`).join('\n\n').slice(0,4000));
   return i.reply({embeds:[e],ephemeral:true});
  }
  if(!manager(i))return i.reply({content:'Only commissioners / configured dynasty managers can rule on disputes.',ephemeral:true});
  const [, , id, action]=i.customId.split('_'); const cases=loadCases(), c=cases.find(x=>x.id===id&&x.guildId===i.guildId);
  if(!c)return i.reply({content:'This dispute was not found in the decision log.',ephemeral:true});
  if(c.status!=='Pending')return i.reply({content:`This case has already been ruled on: **${c.decision}**.`,ephemeral:true});
  const decisions={forcewin:{status:'Approved',label:'Force Win'},disconnect:{status:'Approved',label:'Disconnect Recorded'},restart:{status:'Approved',label:'Restart Approved'},deny:{status:'Denied',label:'Denied'}};
  const dec=decisions[action]; if(!dec)return i.reply({content:'Unknown dispute action.',ephemeral:true});
  c.status=dec.status;c.decision=dec.label;c.decidedBy=i.user.id;c.decisionNote='Recorded by commissioner button.';c.decidedAt=new Date().toISOString();saveCases(cases);
  await i.update({embeds:[embedCase(c)],components:[]});
  const db=loadDatabase(),d=findDynasty(db,c.dynasty); if(d){ for(const coach of (d.coaches||[])){ try{const u=await i.client.users.fetch(coach.userId);await u.send(`📋 **BLACKLINE ruling — ${c.dynasty}**\nDispute #${c.id}: **${dec.label}**.\nSubmitted by: <@${c.userId}>`);}catch{} } }
 }
};
