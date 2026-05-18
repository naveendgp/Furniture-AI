import React from 'react'

export default function SidebarRight({ children }: { children?: React.ReactNode }) {
  return (
    <aside className="right-sidebar" aria-label="Smart controls">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <h3 style={{fontSize:16,fontWeight:600}}>Smart Controls</h3>
        <small style={{color:'rgba(255,255,255,0.5)'}}>Quick actions</small>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        <button className="mini-toolbar">Move closer</button>
        <button className="mini-toolbar">Move farther</button>
        <button className="mini-toolbar">Make larger</button>
        <button className="mini-toolbar">Make smaller</button>
        <button className="mini-toolbar">Rotate left</button>
        <button className="mini-toolbar">Rotate right</button>
      </div>
      {children}
    </aside>
  )
}
