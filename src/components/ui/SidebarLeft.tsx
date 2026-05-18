import React from 'react'

export default function SidebarLeft({ children }: { children?: React.ReactNode }) {
  return (
    <aside className="left-sidebar" aria-label="Furniture library">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <h3 style={{fontSize:16,fontWeight:600}}>Furniture Library</h3>
        <small style={{color:'rgba(255,255,255,0.5)'}}>Browse</small>
      </div>
      <div className="sidebar-search" style={{marginBottom:12}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <input placeholder="Search furniture" className="bg-transparent outline-none placeholder:text-white/40 flex-1" />
      </div>
      <div style={{marginTop:8}}>
        <div className="furniture-card">
          <div style={{width:64,height:64,borderRadius:10,background:'linear-gradient(180deg,#111827,#0b1220)'}} />
          <div style={{flex:1}}>
            <div style={{fontWeight:600}}>Modern Sofa</div>
            <div style={{fontSize:12,color:'rgba(255,255,255,0.6)'}}>2 variants</div>
          </div>
        </div>
        <div className="furniture-card">
          <div style={{width:64,height:64,borderRadius:10,background:'linear-gradient(180deg,#111827,#0b1220)'}} />
          <div style={{flex:1}}>
            <div style={{fontWeight:600}}>Dining Chair</div>
            <div style={{fontSize:12,color:'rgba(255,255,255,0.6)'}}>3 variants</div>
          </div>
        </div>
        {children}
      </div>
    </aside>
  )
}
