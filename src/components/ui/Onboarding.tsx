"use client"

import React from 'react'
import { motion } from 'framer-motion'

export default function Onboarding() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} style={{position:'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 36, zIndex:40}}>
      <div style={{background:'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))', padding:'12px 18px', borderRadius:12, border:'1px solid rgba(255,255,255,0.04)', boxShadow:'0 10px 30px rgba(2,6,23,0.6)'}}>
        <div style={{fontWeight:700, marginBottom:6}}>Welcome to FurnitureAI</div>
        <div style={{color:'rgba(255,255,255,0.75)'}}>Drag a piece from the left library into the room. Click an object to reveal quick actions.</div>
      </div>
    </motion.div>
  )
}
