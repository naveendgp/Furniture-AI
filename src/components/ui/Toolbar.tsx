"use client"

import React from 'react'
import Button from './Button'
import { motion } from 'framer-motion'

function IconUpload() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
  )
}

export default function Toolbar() {
  return (
    <motion.div className="top-toolbar" initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}>
      <Button icon={<IconUpload/>} label="Upload Room" />
      <Button icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>} label="Add Furniture" />
      <Button icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 10l5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>} label="Export" />
      <div style={{width:1, height:28, background:'rgba(255,255,255,0.04)', borderRadius:2}} />
      <Button icon={<svg width="16" height="16" viewBox="0 0 24 24"><path d="M9 11H5a2 2 0 0 0-2 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>} label="Undo" />
      <Button icon={<svg width="16" height="16" viewBox="0 0 24 24"><path d="M15 13h4a2 2 0 0 1 2 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>} label="Redo" />
      <div style={{width:1, height:28, background:'rgba(255,255,255,0.04)', borderRadius:2}} />
      <Button icon={<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>} label="AI Enhance" className="bg-gradient-to-r from-violet-600 to-cyan-400 text-black font-semibold" />
    </motion.div>
  )
}
