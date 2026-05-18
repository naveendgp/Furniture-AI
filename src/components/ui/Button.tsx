"use client"

import React from 'react'
import { motion } from 'framer-motion'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string
  icon?: React.ReactNode
}

export default function Button({ label, icon, className = '', ...rest }: Props) {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={`inline-flex items-center gap-3 px-4 py-2 rounded-md bg-transparent border border-transparent hover:bg-white/3 text-sm text-white/95 ${className}`}
      {...(rest as any)}
    >
      {icon}
      {label ? <span className="text-sm font-medium">{label}</span> : null}
    </motion.button>
  )
}
