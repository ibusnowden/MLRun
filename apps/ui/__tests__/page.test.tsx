import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Page from '../src/app/page'

describe('Home Page', () => {
  it('renders the MLRun heading', () => {
    render(<Page />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toBeDefined()
    expect(heading.textContent).toContain('MLRun')
  })

  it('displays the welcome message', () => {
    render(<Page />)
    const text = screen.getByText(/experiment tracking/i)
    expect(text).toBeDefined()
  })
})
