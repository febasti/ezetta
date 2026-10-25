import '../fontFaces'
import { mount } from 'svelte'
import '../base.css'
import Gallery from './Gallery.svelte'

mount(Gallery, { target: document.getElementById('gallery')! })
