import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SmartImage from './SmartImage'

const PUBLIC = 'https://proj.supabase.co/storage/v1/object/public/paintings/u/cover.jpg'

describe('SmartImage', () => {
  it('renders an optimized main image with alt text', () => {
    render(<SmartImage src={PUBLIC} alt="My artwork" width={600} />)
    const img = screen.getByAltText('My artwork')
    expect(img.getAttribute('src')).toContain('/render/image/public/')
    expect(img.getAttribute('src')).toContain('width=600')
  })

  it('starts transparent and becomes visible after load', () => {
    render(<SmartImage src={PUBLIC} alt="art" />)
    const img = screen.getByAltText('art')
    expect(img.className).toContain('opacity-0')
    fireEvent.load(img)
    expect(img.className).toContain('opacity-100')
  })

  it('renders a blurred LQIP placeholder for Supabase URLs', () => {
    const { container } = render(<SmartImage src={PUBLIC} alt="art" />)
    const placeholder = container.querySelector('img[aria-hidden="true"]')
    expect(placeholder).toBeTruthy()
    expect(placeholder.getAttribute('src')).toContain('width=24')
  })

  it('forwards a srcset when srcWidths is given', () => {
    render(<SmartImage src={PUBLIC} alt="art" srcWidths={[300, 600]} />)
    const img = screen.getByAltText('art')
    expect(img.getAttribute('srcset')).toContain('300w')
    expect(img.getAttribute('srcset')).toContain('600w')
  })

  it('passes through arbitrary props and custom classes', () => {
    render(<SmartImage src={PUBLIC} alt="art" className="object-cover" data-testid="x" />)
    const img = screen.getByTestId('x')
    expect(img.className).toContain('object-cover')
  })
})
