import { supabase } from '../src/lib/supabase/client'
import { useEffect } from 'react'

useEffect(() => {
    const test = async () => {
        const { data, error } = await supabase
            .from('provider_types')
            .select('*')
        console.log('Supabase test:', data, error)    
    }
    test()
}, [])
