import { Component } from '@angular/core';
@Component({
  selector: 'app-marketing',
  imports: [],
  templateUrl: 'marketing.html',
})
export class Marketing {
  features = [
    {
      icon: 'cloud_sync',
      title: 'Real-time Sync',
      description: 'Results are updated instantly across all devices. Sailors can follow the action live from the clubhouse or their phones.'
    },
    {
      icon: 'domain',
      title: 'Custom Domains',
      description: 'Host your results on your own domain (e.g., results.yourclub.com) while leveraging our powerful backend.'
    },
    {
      icon: 'calculate',
      title: 'Complex Scoring',
      description: 'Support for RYA, PHRF, IRC, and custom handicap systems. Automated discards and series tie-breaking.'
    },
    {
      icon: 'security',
      title: 'Secure Access',
      description: 'Role-based permissions for race officers, administrators, and members. Your data is protected and backed up.'
    },
    {
      icon: 'history',
      title: 'Historical Data',
      description: 'Access years of historical results with powerful search and filtering capabilities.'
    },
    {
      icon: 'mobile_friendly',
      title: 'Mobile First',
      description: 'Designed to work perfectly on tablets and phones, making on-the-water result entry a breeze.'
    }
  ];

  benefits = [
    'Automated series scoring and discards',
    'Customizable burgees and club branding',
    'Integrated member and boat database',
    'Export to PDF, CSV, and Sailwave',
    'API access for advanced integrations'
  ];
}
