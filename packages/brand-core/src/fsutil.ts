import fs from 'node:fs'
import path from 'node:path'
import { parse, stringify } from 'yaml'

export function readYaml<T>(file: string): T {
  return parse(fs.readFileSync(file, 'utf8')) as T
}

export function writeYaml(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const text = stringify(data, { lineWidth: 100 })
  fs.writeFileSync(file, text.endsWith('\n') ? text : `${text}\n`)
}

export function writeText(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text.endsWith('\n') ? text : `${text}\n`)
}

export function readText(file: string): string {
  return fs.readFileSync(file, 'utf8')
}

export function exists(file: string): boolean {
  return fs.existsSync(file)
}
